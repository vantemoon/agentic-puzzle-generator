import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { GAME_BUILD_OUTPUT_ROOT, gameBuildPaths } from "../shared/utilities/game-build-paths.js";
import { LevelBundlePreflightError, loadLevelBundleInputs } from "../features/level-bundle/inputs.js";
import { levelBundlePlanPath } from "../features/level-bundle/io.js";
import { evaluateSavedGame } from "../features/game-evaluation/feedback.js";
import { repositoryPuzzleCatalog } from "../features/puzzle-generation/catalog.js";
import type { LevelBlueprint } from "../features/level-design/types.js";
import type { CampaignBriefing } from "../features/game-design/types.js";
import { validateLevelAgainstRequest } from "../features/level-design/validator.js";
import {
    campaignBriefingFor,
    ensureGameDesignInputs,
    fileExists,
    findSavedGameBundle,
    levelFileFor,
    loadAndVerifyLevelBundle,
    readSelectedGame,
    requestFileFor,
    safeFileStem
} from "../features/game-bundle/orchestration.js";

function runTypeScript(entryFile: string, args: string[], outputRoot?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", entryFile, ...args], {
            cwd: process.cwd(),
            env: { ...process.env, [GAME_BUILD_OUTPUT_ROOT]: outputRoot ?? "" },
            stdio: "inherit"
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(
                `${entryFile} failed${signal === null ? ` with exit code ${code}` : ` after signal ${signal}`}.`
            ));
        });
    });
}

function puzzleIdsFromPreflight(error: LevelBundlePreflightError): string[] {
    const ids = new Set<string>();
    for (const issue of error.issues) {
        const match = issue.match(/^Puzzle ([A-Za-z0-9_-]+)\b/);
        if (match !== null) ids.add(match[1]);
    }
    return [...ids];
}

async function ensureLevelBlueprint(levelId: string, outputRoot?: string): Promise<string> {
    const levelFile = levelFileFor(levelId, outputRoot);
    if (!await fileExists(levelFile)) {
        process.stderr.write(`Generating missing level blueprint: ${levelId}\n`);
        await runTypeScript("src/cli/level-design.ts", [requestFileFor(levelId, outputRoot)], outputRoot);
    }
    return levelFile;
}

async function ensurePuzzles(levelFile: string, outputRoot?: string): Promise<void> {
    const inputs = { ...gameBuildPaths(outputRoot), levelFile, catalog: repositoryPuzzleCatalog };
    process.stderr.write(`Generating missing puzzle artifacts for ${path.basename(levelFile)}\n`);
    await runTypeScript("src/cli/generate-puzzle.ts", [levelFile, "--all"], outputRoot);
    try {
        await loadLevelBundleInputs(inputs);
    } catch (error) {
        if (!(error instanceof LevelBundlePreflightError)) throw error;
        const puzzleIds = puzzleIdsFromPreflight(error);
        if (puzzleIds.length === 0) throw error;
        for (const puzzleId of puzzleIds) {
            process.stderr.write(`Repairing invalid puzzle artifact: ${puzzleId}\n`);
            await runTypeScript("src/cli/generate-puzzle.ts", [levelFile, puzzleId, "--force"], outputRoot);
        }
        await loadLevelBundleInputs(inputs);
    }
}

async function ensureLevelBundle(levelFile: string, campaignBriefing?: CampaignBriefing, outputRoot?: string) {
    try {
        const verified = await loadAndVerifyLevelBundle(levelFile, campaignBriefing, outputRoot);
        process.stderr.write(`Reused verified level bundle: ${verified.inputs.level.id}\n`);
        return verified;
    } catch (error) {
        process.stderr.write(
            `Generating missing or invalid level bundle for ${path.basename(levelFile)}: `
            + `${error instanceof Error ? error.message : String(error)}\n`
        );
        await runTypeScript("src/cli/level-bundle.ts", [levelFile], outputRoot);
        return loadAndVerifyLevelBundle(levelFile, campaignBriefing, outputRoot);
    }
}

async function buildCandidate({ game, gameFile }: Awaited<ReturnType<typeof readSelectedGame>>, outputRoot?: string) {
    const campaignBriefing = campaignBriefingFor(game);
    const { bundleDirectory } = gameBuildPaths(outputRoot);
    await ensureGameDesignInputs(game, outputRoot);
    const builtLevels = [];
    for (const [index, assignment] of game.levels.entries()) {
        const levelId = assignment.request.levelId;
        process.stderr.write(`\n[${index + 1}/${game.levels.length}] Preparing ${levelId}\n`);
        const levelFile = await ensureLevelBlueprint(levelId, outputRoot);
        if (assignment.request.investigationQuestion !== undefined) {
            const level = JSON.parse(await readFile(levelFile, "utf8")) as LevelBlueprint;
            const errors = validateLevelAgainstRequest(level, assignment.request, repositoryPuzzleCatalog);
            if (errors.length > 0) throw new Error(`[level-design] ${levelId}:\n- ${errors.join("\n- ")}`);
        }
        await ensurePuzzles(levelFile, outputRoot);
        const built = await ensureLevelBundle(levelFile, index === 0 ? campaignBriefing : undefined, outputRoot);
        builtLevels.push({
            id: levelId,
            title: built.inputs.level.title,
            levelFile,
            bundlePlan: levelBundlePlanPath(levelId, bundleDirectory),
            publicDirectory: built.publicDirectory,
            privateDirectory: built.privateDirectory
        });
    }
    return evaluateSavedGame({
        schemaVersion: "1.0.0",
        gameId: game.id,
        title: game.title,
        gameFile,
        outputRoot,
        campaignBriefing,
        levels: builtLevels
    }, { revise: true });
}

async function main(): Promise<void> {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: { regenerate: { type: "boolean" }, resume: { type: "string" } }
    });
    const [gameSelector] = positionals;
    if (!gameSelector || positionals.length !== 1 || (values.regenerate && values.resume !== undefined)) {
        throw new Error("Usage: npm run game:build-ready -- <game-id|game-design-file> [--regenerate | --resume <generation-directory>]");
    }
    const selected = await readSelectedGame(gameSelector);
    const { game } = selected;
    const gameDirectory = path.resolve("generated-games", safeFileStem(game.id));
    await mkdir(gameDirectory, { recursive: true });
    const designHash = createHash("sha256").update(JSON.stringify(game)).digest("hex");
    const checkpointFile = "failed-generation";
    const resumeRoot = values.resume === undefined ? undefined : await realpath(values.resume);
    if (resumeRoot && (path.dirname(resumeRoot) !== await realpath(gameDirectory)
        || !path.basename(resumeRoot).startsWith("generation-"))) {
        throw new Error(`The resume directory must be a generation directory under ${gameDirectory}.`);
    }
    let stagedRoot: string | undefined;
    if (resumeRoot) {
        const checkpoint = path.join(resumeRoot, checkpointFile);
        if (!await fileExists(checkpoint) || await readFile(checkpoint, "utf8") !== designHash) {
            throw new Error("Resume requires a failed generation from the same saved game design.");
        }
        // Claim the checkpoint by moving it before any stage can write to it.
        stagedRoot = path.join(gameDirectory, `generation-${randomUUID()}`);
        await rename(resumeRoot, stagedRoot);
        await rm(path.join(stagedRoot, checkpointFile));
        process.stderr.write(`Resuming generation in ${stagedRoot}\n`);
    } else if (values.regenerate) {
        stagedRoot = await mkdtemp(path.join(gameDirectory, "generation-"));
        process.stderr.write(`Regenerating from the saved game design: ${game.id}\n`);
    }
    const outputRoot = stagedRoot ?? (await findSavedGameBundle(game.id))?.outputRoot;
    const manifestPath = path.join(gameDirectory, "game.bundle.json");
    const pendingManifest = `${manifestPath}.${process.pid}.tmp`;
    try {
        const reviewed = await buildCandidate(selected, outputRoot);
        await writeFile(pendingManifest, `${JSON.stringify(reviewed, null, 2)}\n`, "utf8");
        await rename(pendingManifest, manifestPath);
    } catch (error) {
        if (stagedRoot) {
            await writeFile(path.join(stagedRoot, checkpointFile), designHash);
            process.stderr.write(
                `Generation work was kept in ${path.relative(process.cwd(), stagedRoot)}. Use --resume with that directory to continue.\n`
            );
        }
        throw error;
    } finally {
        await rm(pendingManifest, { force: true });
    }
    process.stdout.write(`Game bundle manifest: ${manifestPath}\n`);
    process.stdout.write("Built candidate. Use game:verify-ready to review the blind playtest before release.\n");
    process.stdout.write(`Preview command: npm run game:serve-ready -- ${game.id}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
