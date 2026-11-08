import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PuzzleCatalog } from "../levels/catalog.js";
import { writeGameWorldFile } from "../world/io.js";
import type { GameWorldFile } from "../world/types.js";
import type { GameDesignSpec } from "./types.js";
import { assertGameDesignSpec, gameManifestFromSpec } from "./validator.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("ID cannot be converted to a safe filename.");
    return stem;
}

export interface WrittenGameDesign {
    specPath: string;
    worldPath: string;
    manifestPath: string;
    requestPaths: string[];
}

export async function writeGameDesign(options: {
    spec: GameDesignSpec;
    catalog: PuzzleCatalog;
    rootDirectory?: string;
}): Promise<WrittenGameDesign> {
    assertGameDesignSpec(options.spec, options.catalog);
    const root = path.resolve(options.rootDirectory ?? ".");
    const designDirectory = path.join(root, "game-designs");
    const requestDirectory = path.join(root, "level-requests");
    await Promise.all([
        mkdir(designDirectory, { recursive: true }),
        mkdir(requestDirectory, { recursive: true })
    ]);

    const stem = safeFileStem(options.spec.id);
    const specPath = path.join(designDirectory, `${stem}.game-design.json`);
    const manifestPath = path.join(designDirectory, `${stem}.manifest.json`);
    const manifest = gameManifestFromSpec(options.spec);
    const requestPaths = options.spec.levels.map((level) =>
        path.join(requestDirectory, `${safeFileStem(level.request.levelId)}.request.json`)
    );
    const worldFile: GameWorldFile = { ...options.spec.world };
    const worldPath = await writeGameWorldFile({ world: worldFile, outputDirectory: path.join(root, "worlds") });

    await Promise.all([
        writeFile(specPath, `${JSON.stringify(options.spec, null, 2)}\n`, "utf8"),
        writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        ...options.spec.levels.map((level, index) =>
            writeFile(requestPaths[index], `${JSON.stringify(level.request, null, 2)}\n`, "utf8")
        )
    ]);
    return { specPath, worldPath, manifestPath, requestPaths };
}

