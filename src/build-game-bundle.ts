import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { LevelBundlePreflightError, loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import {
    ensureGameDesignInputs,
    fileExists,
    levelFileFor,
    loadAndVerifyLevelBundle,
    readSelectedGame,
    requestFileFor,
    safeFileStem
} from "./game-bundle-orchestration.js";

function runTypeScript(entryFile: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", entryFile, ...args], {
            cwd: process.cwd(),
            env: process.env,
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

async function ensureLevelBlueprint(levelId: string): Promise<string> {
    const levelFile = levelFileFor(levelId);
    if (!await fileExists(levelFile)) {
        process.stderr.write(`Generating missing level blueprint: ${levelId}\n`);
        await runTypeScript("src/run-level-design.ts", [requestFileFor(levelId)]);
    }
    return levelFile;
}

async function ensurePuzzles(levelFile: string): Promise<void> {
    process.stderr.write(`Generating missing puzzle artifacts for ${path.basename(levelFile)}\n`);
    await runTypeScript("src/generate-level-puzzle.ts", [levelFile, "--all"]);
    try {
        await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    } catch (error) {
        if (!(error instanceof LevelBundlePreflightError)) throw error;
        const puzzleIds = puzzleIdsFromPreflight(error);
        if (puzzleIds.length === 0) throw error;
        for (const puzzleId of puzzleIds) {
            process.stderr.write(`Repairing invalid puzzle artifact: ${puzzleId}\n`);
            await runTypeScript("src/generate-level-puzzle.ts", [levelFile, puzzleId, "--force"]);
        }
        await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    }
}

async function ensureLevelBundle(levelFile: string): Promise<Awaited<ReturnType<typeof loadAndVerifyLevelBundle>>> {
    try {
        const verified = await loadAndVerifyLevelBundle(levelFile);
        process.stderr.write(`Reused verified level bundle: ${verified.inputs.level.id}\n`);
        return verified;
    } catch (error) {
        process.stderr.write(
            `Generating missing or invalid level bundle for ${path.basename(levelFile)}: `
            + `${error instanceof Error ? error.message : String(error)}\n`
        );
        await runTypeScript("src/run-level-bundle.ts", [levelFile]);
        return loadAndVerifyLevelBundle(levelFile);
    }
}

async function main(): Promise<void> {
    const [gameSelector, ...extraArguments] = process.argv.slice(2);
    if (gameSelector === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run game:build-ready -- <game-id|game-design-file>");
    }
    const { game, gameFile } = await readSelectedGame(gameSelector);
    await ensureGameDesignInputs(game);
    const builtLevels = [];
    for (const [index, assignment] of game.levels.entries()) {
        const levelId = assignment.request.levelId;
        process.stderr.write(`\n[${index + 1}/${game.levels.length}] Preparing ${levelId}\n`);
        const levelFile = await ensureLevelBlueprint(levelId);
        await ensurePuzzles(levelFile);
        const built = await ensureLevelBundle(levelFile);
        builtLevels.push({
            id: levelId,
            title: built.inputs.level.title,
            levelFile,
            bundlePlan: path.resolve("generated-bundles", safeFileStem(levelId), "level.bundle.json"),
            publicDirectory: built.publicDirectory,
            privateDirectory: built.privateDirectory
        });
    }
    const gameDirectory = path.resolve("generated-games", safeFileStem(game.id));
    await mkdir(gameDirectory, { recursive: true });
    const manifestPath = path.join(gameDirectory, "game.bundle.json");
    await writeFile(manifestPath, `${JSON.stringify({
        schemaVersion: "1.0.0",
        gameId: game.id,
        title: game.title,
        gameFile,
        levels: builtLevels
    }, null, 2)}\n`, "utf8");
    process.stdout.write(`Game bundle manifest: ${manifestPath}\n`);
    process.stdout.write(`Preview command: npm run game:serve-ready -- ${game.id}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
