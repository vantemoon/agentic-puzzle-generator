import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { gameBuildPaths } from "../../shared/utilities/game-build-paths.js";

import { evaluateGame, type EditorialEdit, type EditorialTarget } from "./agent/agent.js";
import { loadLevelEvidence } from "./evidence.js";
import { reportMarkdown } from "./report.js";
import {
    loadSavedGameLevel, safeFileStem, verifySavedGameLevel, type SavedGameBundleManifest
} from "../game-bundle/orchestration.js";
import { verifyGameInteractions } from "../game-bundle/playability.js";
import { bundleAnswers, findBundleAnswer } from "../level-bundle/answers.js";
import { buildLevelBundle, renderProseBlock, type PublicBundleManifest } from "../level-bundle/build.js";
import { writeLevelBundleFile } from "../level-bundle/io.js";
import type { BundleContentBlock, LevelBundle } from "../level-bundle/types.js";
import { repositoryPuzzleCatalog } from "../puzzle-generation/catalog.js";

type PreparedLevel = Awaited<ReturnType<typeof loadSavedGameLevel>>;
type Prose = Extract<BundleContentBlock, { kind: "prose" }>;

function publicPath(basePath: string, routePath: string): string {
    return routePath === "/" ? basePath : basePath + routePath;
}

function copyTargets(levels: PreparedLevel[]): EditorialTarget[] {
    return levels.flatMap(({ bundle }, index) => bundle.sites.flatMap((site) => site.routes
        .filter((route) => route.role === "structural" || route.role === "supporting")
        .map((route) => ({ level: index + 1, path: publicPath(site.basePath, route.path) }))));
}

export function applyEditorialEdits(level: PreparedLevel, edits: EditorialEdit[]): {
    bundle: LevelBundle;
    additions: Map<string, Prose>;
} {
    const bundle = structuredClone(level.bundle);
    const additions = new Map<string, Prose>();
    const protectedValues = [
        ...bundleAnswers(level.inputs.puzzles),
        ...level.inputs.level.puzzles.flatMap((node) => node.design.outputs.flatMap((output) =>
            output.from === "revealed" ? [{ puzzleId: node.id, value: String(output.value), caseInsensitive: true }] : []))
    ].map((answer) => ({ ...answer, caseInsensitive: true }));

    for (const edit of edits) {
        const route = bundle.sites.flatMap((site) => site.routes.map((candidate) =>
            ({ candidate, path: publicPath(site.basePath, candidate.path) })))
            .find((entry) => entry.path === edit.path)?.candidate;
        const paragraph = edit.paragraph.trim();
        if (!route || (route.role !== "structural" && route.role !== "supporting") || additions.has(edit.path)
            || !paragraph || paragraph.length > 600 || /[<>\r\n]|\b(?:https?:|www\.)|(?:^|\s)\/\S/i.test(paragraph)
            || findBundleAnswer(paragraph, protectedValues)) {
            throw new Error(`Rejected copy addition at ${edit.path}. Revisions can append plain publisher prose only, without routes or puzzle values.`);
        }
        const block: Prose = { kind: "prose", paragraphs: [paragraph] };
        route.content.blocks.push(block);
        additions.set(edit.path, block);
    }
    return { bundle, additions };
}

export async function assertCopyOnlyBuild(
    original: string, revised: string, additions: Map<string, Prose>
): Promise<void> {
    const manifest = async (directory: string) =>
        JSON.parse(await readFile(path.join(directory, "bundle.manifest.json"), "utf8")) as PublicBundleManifest;
    const before = await manifest(original);
    const after = await manifest(revised);
    const { routes: beforeRoutes, ...beforeInventory } = before;
    const { routes: afterRoutes, ...afterInventory } = after;
    if (!isDeepStrictEqual(beforeInventory, afterInventory)
        || !isDeepStrictEqual(beforeRoutes.map(({ path }) => path), afterRoutes.map(({ path }) => path))) {
        throw new Error(`Editorial rebuild changed routes, sites, or assets in ${before.levelId}.`);
    }
    await Promise.all(beforeRoutes.map(async (entry, index) => {
        const addition = additions.get(entry.path);
        if (!addition) {
            if (!isDeepStrictEqual(entry, afterRoutes[index])) {
                throw new Error(`Editorial rebuild changed untouched public page ${entry.path}.`);
            }
            return;
        }
        const file = path.join(entry.path.slice(1), "index.html");
        const [oldHtml, newHtml] = await Promise.all([original, revised].map((directory) =>
            readFile(path.join(directory, file), "utf8")));
        const inserted = `\n${renderProseBlock(addition)}`;
        if (oldHtml.includes(inserted) || !newHtml.includes(inserted) || newHtml.replace(inserted, "") !== oldHtml) {
            throw new Error(`Editorial rebuild changed more than the approved paragraph on ${entry.path}.`);
        }
    }));
}

export async function evaluateSavedGame(
    game: SavedGameBundleManifest,
    options: { revise: boolean }
): Promise<SavedGameBundleManifest> {
    const progress = (message: string) => process.stderr.write(`${message}\n`);
    progress(`Validating required interactions for ${game.title} before evaluation.`);
    const baseline = await Promise.all(game.levels.map((level) => loadSavedGameLevel(level, game.outputRoot)));
    await Promise.all(baseline.map(verifySavedGameLevel));
    await verifyGameInteractions(baseline);

    const directory = path.resolve("results", "evaluations");
    await mkdir(directory, { recursive: true });
    const review = (levels: SavedGameBundleManifest["levels"], targets?: EditorialTarget[]) =>
        evaluateGame(game.title, (withImages) => Promise.all(levels.map((level) =>
            loadLevelEvidence(level, withImages))), progress, targets);
    const saveReport = async (file: string, result: Awaited<ReturnType<typeof evaluateGame>>) => {
        await writeFile(file, reportMarkdown(game.title, game.gameId, result.modelId, result.report, result.levels), "utf8");
        process.stdout.write(`Evaluation report: ${file}\n`);
    };
    const original = await review(game.levels, options.revise ? copyTargets(baseline) : []);
    await saveReport(path.join(directory, `${safeFileStem(game.gameId)}.md`), original);
    if (original.edits.length === 0) {
        if (options.revise) progress("Evaluation proposed no eligible copy revisions.");
        return game;
    }

    const revisedDirectory = await mkdtemp(path.join(directory, `${safeFileStem(game.gameId)}-revision-`));
    try {
        const revisions = baseline.map((level, index) =>
            applyEditorialEdits(level, original.edits.filter((edit) => edit.level === index + 1)));
        const manifest: SavedGameBundleManifest = { ...game, levels: [] };
        const revisedLevels: PreparedLevel[] = [];
        for (const [index, { bundle, additions }] of revisions.entries()) {
            const { inputs, publicDirectory } = baseline[index];
            const built = await buildLevelBundle({
                bundle, inputs, catalog: repositoryPuzzleCatalog, outputDirectory: revisedDirectory,
                worldMediaDirectory: gameBuildPaths(game.outputRoot).worldMediaDirectory,
                campaignBriefing: index === 0 ? game.campaignBriefing : undefined
            });
            await assertCopyOnlyBuild(publicDirectory, built.publicDirectory, additions);
            const bundlePlan = await writeLevelBundleFile({
                bundle, level: inputs.level, world: inputs.world, catalog: repositoryPuzzleCatalog, outputDirectory: revisedDirectory
            });
            const revised = { inputs, bundle, publicDirectory: built.publicDirectory, privateDirectory: built.privateDirectory };
            await verifySavedGameLevel(revised);
            revisedLevels.push(revised);
            manifest.levels.push({
                ...game.levels[index], bundlePlan, publicDirectory: built.publicDirectory, privateDirectory: built.privateDirectory
            });
        }
        progress("Validating required interactions after the copy revisions.");
        await verifyGameInteractions(revisedLevels);
        const after = await review(manifest.levels);
        await saveReport(path.join(revisedDirectory, "after.md"), after);
        await writeFile(path.join(revisedDirectory, "before.md"),
            reportMarkdown(game.title, game.gameId, original.modelId, original.report, original.levels), "utf8");
        await writeFile(path.join(revisedDirectory, "changes.json"), `${JSON.stringify(original.edits, null, 2)}\n`, "utf8");
        const candidateFile = path.join(revisedDirectory, "game.bundle.json");
        await writeFile(candidateFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        progress(`Validated revised candidate: ${candidateFile}`);
        return manifest;
    } catch (error) {
        await rm(revisedDirectory, { recursive: true, force: true });
        progress(`Copy revision discarded. Keeping the validated baseline. ${error instanceof Error ? error.message : String(error)}`);
        return game;
    }
}
