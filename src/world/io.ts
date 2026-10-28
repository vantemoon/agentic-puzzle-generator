import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GameWorld } from "./types.js";
import { assertGameWorld } from "./validator.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Game-world ID cannot be converted to a safe filename.");
    return stem;
}

export async function readGameWorldFile(filePath: string): Promise<GameWorld> {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    assertGameWorld(value);
    return value;
}

export async function writeGameWorldFile(options: {
    world: GameWorld;
    outputDirectory?: string;
}): Promise<string> {
    assertGameWorld(options.world);
    const outputDirectory = path.resolve(options.outputDirectory ?? "worlds");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${safeFileStem(options.world.id)}.world.json`);
    await writeFile(outputPath, `${JSON.stringify(options.world, null, 2)}\n`, "utf8");
    return outputPath;
}
