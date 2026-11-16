import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configuredSupportingItemRange } from "./agents/level-bundle/limits.js";

import { assertGameDesignSpec } from "./game-design/validator.js";
import type { GameDesignSpec } from "./game-design/types.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { loadLevelBundleInputs, type LevelBundleInputs } from "./levels/bundle-inputs.js";
import { levelBundlePlanPath, readLevelBundleFile } from "./levels/bundle-io.js";
import { verifyLevelBundle } from "./levels/bundle-verify.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import type { LevelBundle } from "./levels/bundle.js";

export function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("ID cannot be converted to a safe filename.");
    return stem;
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

export function levelFileFor(levelId: string): string {
    return path.resolve("generated-levels", `${safeFileStem(levelId)}.level.json`);
}

export function requestFileFor(levelId: string): string {
    return path.resolve("level-requests", `${safeFileStem(levelId)}.request.json`);
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function ensureGameDesignInputs(game: GameDesignSpec): Promise<void> {
    await Promise.all([
        mkdir(path.resolve("worlds"), { recursive: true }),
        mkdir(path.resolve("level-requests"), { recursive: true })
    ]);
    await writeFile(
        path.resolve("worlds", `${safeFileStem(game.world.id)}.world.json`),
        `${JSON.stringify(game.world, null, 2)}\n`,
        "utf8"
    );
    await Promise.all(game.levels.map(({ request }) => writeFile(
        requestFileFor(request.levelId),
        `${JSON.stringify(request, null, 2)}\n`,
        "utf8"
    )));
}

export async function loadAndVerifyLevelBundle(levelFile: string): Promise<{
    inputs: LevelBundleInputs;
    bundle: LevelBundle;
    publicDirectory: string;
    privateDirectory: string;
}> {
    const inputs = await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    const bundle = await readLevelBundleFile({
        filePath: levelBundlePlanPath(inputs.level.id),
        level: inputs.level,
        catalog: repositoryPuzzleCatalog,
        world: inputs.world
    });
    const build = await buildLevelBundle({ bundle, inputs, catalog: repositoryPuzzleCatalog });
    const supportingRange = configuredSupportingItemRange(inputs.puzzles.length);
    await verifyLevelBundle({
        bundle,
        inputs,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory,
        supportingItemsMinimum: supportingRange.minimum,
        supportingItemsMaximum: supportingRange.maximum
    });
    return {
        inputs,
        bundle,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory
    };
}
