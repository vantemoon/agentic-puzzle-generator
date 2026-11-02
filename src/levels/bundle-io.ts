import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PuzzleCatalog } from "./catalog.js";
import { assertLevelBundle, type LevelBundle } from "./bundle.js";
import type { LevelBlueprint } from "./types.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Level ID cannot be converted to a safe filename.");
    return stem;
}

export function levelBundlePlanPath(levelId: string, rootDirectory = "generated-bundles"): string {
    return path.resolve(rootDirectory, safeFileStem(levelId), "level.bundle.json");
}

export async function writeLevelBundleFile(options: {
    bundle: LevelBundle;
    level: LevelBlueprint;
    catalog: PuzzleCatalog;
    outputDirectory?: string;
}): Promise<string> {
    assertLevelBundle(options.bundle, options.level, options.catalog);
    const outputPath = levelBundlePlanPath(options.level.id, options.outputDirectory);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(options.bundle, null, 2)}\n`, "utf8");
    return outputPath;
}

export async function readLevelBundleFile(options: {
    filePath: string;
    level: LevelBlueprint;
    catalog: PuzzleCatalog;
}): Promise<LevelBundle> {
    const value = JSON.parse(await readFile(path.resolve(options.filePath), "utf8")) as unknown;
    assertLevelBundle(value, options.level, options.catalog);
    return value;
}
