import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PuzzleCatalog } from "./catalog.js";
import type { LevelBlueprint, LevelDesignFailure } from "./types.js";
import { assertLevelBlueprint } from "./validator.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Level ID cannot be converted to a safe filename.");
    return stem;
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
