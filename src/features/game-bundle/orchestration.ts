import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configuredSupportingItemRange } from "../level-bundle/limits.js";

import { safeFileStem } from "../../shared/utilities/file-names.js";
import { gameBuildPaths } from "../../shared/utilities/game-build-paths.js";
import { assertGameDesignSpec } from "../game-design/validator.js";
import type { CampaignBriefing, GameDesignSpec } from "../game-design/types.js";
import { buildLevelBundle } from "../level-bundle/build.js";
import { loadLevelBundleInputs, type LevelBundleInputs } from "../level-bundle/inputs.js";
import { levelBundlePlanPath, readLevelBundleFile } from "../level-bundle/io.js";
import { verifyLevelBundle } from "../level-bundle/verify.js";
import { repositoryPuzzleCatalog } from "../puzzle-generation/catalog.js";
import type { LevelBundle } from "../level-bundle/types.js";

export { safeFileStem };

export function campaignBriefingFor(game: GameDesignSpec): CampaignBriefing | undefined {
    if (game.openingBriefing) {
        return { ...game.openingBriefing, title: game.title, playerRole: game.playerRole };
    }
}

export function resolveGameDesignFile(selector: string): string {
    return selector.endsWith(".json") || selector.includes("/")
        ? path.resolve(selector)
        : path.resolve("game-designs", `${selector}.game-design.json`);
}

export async function readSelectedGame(selector: string): Promise<{
    game: GameDesignSpec;
    gameFile: string;
}> {
    const gameFile = resolveGameDesignFile(selector);
    const game = JSON.parse(await readFile(gameFile, "utf8")) as unknown;
    assertGameDesignSpec(game, repositoryPuzzleCatalog);
    return { game, gameFile };
}

export function levelFileFor(levelId: string, outputRoot?: string): string {
    return path.join(gameBuildPaths(outputRoot).levelDirectory, `${safeFileStem(levelId)}.level.json`);
}

export function requestFileFor(levelId: string, outputRoot?: string): string {
    return path.join(gameBuildPaths(outputRoot).requestDirectory, `${safeFileStem(levelId)}.request.json`);
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function ensureGameDesignInputs(game: GameDesignSpec, outputRoot?: string): Promise<void> {
    const { worldDirectory, requestDirectory } = gameBuildPaths(outputRoot);
    await Promise.all([
        mkdir(worldDirectory, { recursive: true }),
        mkdir(requestDirectory, { recursive: true })
    ]);
    await writeFile(
        path.join(worldDirectory, `${safeFileStem(game.world.id)}.world.json`),
        `${JSON.stringify(game.world, null, 2)}\n`,
        "utf8"
    );
    await Promise.all(game.levels.map(({ request }) => writeFile(
        requestFileFor(request.levelId, outputRoot),
        `${JSON.stringify(request, null, 2)}\n`,
        "utf8"
    )));
}

export interface SavedGameBundleManifest {
    schemaVersion: "1.0.0";
    gameId: string;
    title: string;
    gameFile: string;
    outputRoot?: string;
    campaignBriefing?: CampaignBriefing;
    levels: Array<{
        id: string;
        title: string;
        levelFile: string;
        bundlePlan: string;
        publicDirectory: string;
        privateDirectory: string;
    }>;
}

export async function findSavedGameBundle(selector: string): Promise<SavedGameBundleManifest | undefined> {
    if (path.basename(selector) === "game.bundle.json"
        || (/^[a-z0-9][a-z0-9_-]*$/.test(selector)
            && await fileExists(path.resolve("generated-games", selector, "game.bundle.json")))) {
        return readSavedGameBundle(selector);
    }
    return undefined;
}

export async function readSavedGameBundle(selector: string): Promise<SavedGameBundleManifest> {
    const isManifest = path.basename(selector) === "game.bundle.json";
    const filePath = isManifest ? path.resolve(selector) : path.resolve("generated-games", safeFileStem(selector), "game.bundle.json");
    const manifest = JSON.parse(await readFile(filePath, "utf8")) as SavedGameBundleManifest;
    if (manifest.schemaVersion !== "1.0.0" || typeof manifest.gameId !== "string"
        || (!isManifest && manifest.gameId !== selector) || typeof manifest.title !== "string"
        || typeof manifest.gameFile !== "string"
        || (manifest.outputRoot !== undefined && (typeof manifest.outputRoot !== "string" || manifest.outputRoot.length === 0))
        || !Array.isArray(manifest.levels) || manifest.levels.length === 0
        || manifest.levels.some((level) => !level || [level.id, level.title, level.levelFile, level.bundlePlan,
            level.publicDirectory, level.privateDirectory].some((value) => typeof value !== "string" || value.length === 0))
        || new Set(manifest.levels.map(({ id }) => safeFileStem(id))).size !== manifest.levels.length) {
        throw new Error(`Invalid saved game bundle manifest: ${filePath}`);
    }
    // Portable examples resolve paths beside their manifest, independently of cwd.
    // Existing absolute paths keep their original meaning.
    const directory = path.dirname(filePath);
    return {
        ...manifest,
        gameFile: path.resolve(directory, manifest.gameFile),
        ...(manifest.outputRoot === undefined ? {} : { outputRoot: path.resolve(directory, manifest.outputRoot) }),
        levels: manifest.levels.map((level) => ({
            ...level,
            levelFile: path.resolve(directory, level.levelFile),
            bundlePlan: path.resolve(directory, level.bundlePlan),
            publicDirectory: path.resolve(directory, level.publicDirectory),
            privateDirectory: path.resolve(directory, level.privateDirectory)
        }))
    };
}

export async function loadSavedGameLevel(level: SavedGameBundleManifest["levels"][number], outputRoot?: string) {
    const inputs = await loadLevelBundleInputs({
        ...gameBuildPaths(outputRoot), levelFile: level.levelFile, catalog: repositoryPuzzleCatalog
    });
    if (inputs.level.id !== level.id) throw new Error(`Saved bundle level ID does not match ${level.id}.`);
    const bundle = await readLevelBundleFile({
        filePath: level.bundlePlan, level: inputs.level, catalog: repositoryPuzzleCatalog, world: inputs.world
    });
    return { inputs, bundle, publicDirectory: level.publicDirectory, privateDirectory: level.privateDirectory };
}

export async function verifySavedGameLevel(level: Awaited<ReturnType<typeof loadSavedGameLevel>>) {
    const supportingRange = configuredSupportingItemRange(level.inputs.puzzles.length);
    return verifyLevelBundle({
        ...level, supportingItemsMaximum: supportingRange.maximum,
        writeReport: false
    });
}

export async function loadAndVerifyLevelBundle(levelFile: string, campaignBriefing?: CampaignBriefing, outputRoot?: string): Promise<{
    inputs: LevelBundleInputs;
    bundle: LevelBundle;
    publicDirectory: string;
    privateDirectory: string;
}> {
    const paths = gameBuildPaths(outputRoot);
    const inputs = await loadLevelBundleInputs({ ...paths, levelFile, catalog: repositoryPuzzleCatalog });
    const bundle = await readLevelBundleFile({
        filePath: levelBundlePlanPath(inputs.level.id, paths.bundleDirectory),
        level: inputs.level,
        catalog: repositoryPuzzleCatalog,
        world: inputs.world
    });
    const build = await buildLevelBundle({
        bundle, inputs, catalog: repositoryPuzzleCatalog, campaignBriefing,
        outputDirectory: paths.bundleDirectory, worldMediaDirectory: paths.worldMediaDirectory
    });
    const supportingRange = configuredSupportingItemRange(inputs.puzzles.length);
    await verifyLevelBundle({
        bundle,
        inputs,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory,
        supportingItemsMaximum: supportingRange.maximum
    });
    return {
        inputs,
        bundle,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory
    };
}
