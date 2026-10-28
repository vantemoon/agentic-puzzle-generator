import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readGameWorldFile } from "../world/io.js";
import type { GameWorld } from "../world/types.js";
import type { PuzzleCatalog } from "./catalog.js";
import type { LevelBlueprint, LevelDesignFailure, LevelDesignRequest } from "./types.js";
import { assertLevelBlueprint, assertLevelDesignRequest } from "./validator.js";
import { resolveLevelWorld, type LevelWorldContext } from "./world.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Level ID cannot be converted to a safe filename.");
    return stem;
}

export async function readLevelDesignRequestFile(filePath: string): Promise<LevelDesignRequest> {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    assertLevelDesignRequest(value);
    return value;
}

export async function loadLevelDesignInputs(options: {
    requestFile: string;
    worldDirectory?: string;
}): Promise<{
    request: LevelDesignRequest;
    world: GameWorld;
    context: LevelWorldContext;
    worldFile: string;
}> {
    const request = await readLevelDesignRequestFile(path.resolve(options.requestFile));
    const worldDirectory = path.resolve(options.worldDirectory ?? "worlds");
    const worldFile = path.join(worldDirectory, `${safeFileStem(request.world.id)}.world.json`);
    const world = await readGameWorldFile(worldFile);
    const context = resolveLevelWorld(request.world, world);
    return { request, world, context, worldFile };
}

export async function writeLevelBlueprintFile(options: {
    level: LevelBlueprint;
    catalog: PuzzleCatalog;
    outputDirectory?: string;
}): Promise<string> {
    assertLevelBlueprint(options.level, options.catalog);
    const outputDirectory = path.resolve(options.outputDirectory ?? "generated-levels");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${safeFileStem(options.level.id)}.level.json`);
    await writeFile(outputPath, `${JSON.stringify(options.level, null, 2)}\n`, "utf8");
    return outputPath;
}

export async function writeLevelDesignFailureFile(options: {
    failure: LevelDesignFailure;
    outputDirectory?: string;
}): Promise<string> {
    const outputDirectory = path.resolve(options.outputDirectory ?? "generated-levels");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${safeFileStem(options.failure.requestId)}.level-rejection.json`);
    await writeFile(outputPath, `${JSON.stringify(options.failure, null, 2)}\n`, "utf8");
    return outputPath;
}
