import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GameWorld, GameWorldFile, WorldRevisionAdditions } from "./types.js";
import {
    assertGameWorld,
    assertGameWorldFile,
    assertWorldRevisionAdditions
} from "./validator.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Game-world ID cannot be converted to a safe filename.");
    return stem;
}

async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function readWorldRevisionAdditionsFile(filePath: string): Promise<WorldRevisionAdditions> {
    const value = await readJson(filePath);
    assertWorldRevisionAdditions(value);
    return value;
}

function mergeAdditions(world: GameWorld, additions: WorldRevisionAdditions): GameWorld {
    const entityIds = new Set(world.entities.map((entity) => entity.id));
    const factIds = new Set(world.facts.map((fact) => fact.id));
    const duplicateEntity = additions.entities.find((entity) => entityIds.has(entity.id));
    if (duplicateEntity !== undefined) {
        throw new Error(`World revision ${additions.revision} redefines entity ${duplicateEntity.id}.`);
    }
    const duplicateFact = additions.facts.find((fact) => factIds.has(fact.id));
    if (duplicateFact !== undefined) {
        throw new Error(`World revision ${additions.revision} redefines fact ${duplicateFact.id}.`);
    }
    const merged: GameWorld = {
        ...world,
        revision: additions.revision,
        entities: [...world.entities, ...additions.entities],
        facts: [...world.facts, ...additions.facts]
    };
    assertGameWorld(merged);
    return merged;
}

export async function readGameWorldFile(
    filePath: string,
    options: { revision?: string } = {}
): Promise<GameWorld> {
    const rootPath = path.resolve(filePath);
    const value = await readJson(rootPath);
    assertGameWorldFile(value);
    const root = value as GameWorldFile;
    const requestedRevision = options.revision ?? root.revision;
    const { revisionPointers: _pointers, ...baseWorld } = root;
    let world: GameWorld = baseWorld;
    if (requestedRevision === world.revision) return world;

    const targetIndex = (root.revisionPointers ?? []).findIndex(
        (pointer) => pointer.revision === requestedRevision
    );
    if (targetIndex < 0) {
        throw new Error(`Game world ${root.id} has no revision ${requestedRevision}.`);
    }

    for (const pointer of (root.revisionPointers ?? []).slice(0, targetIndex + 1)) {
        const additionsPath = path.resolve(path.dirname(rootPath), pointer.file);
        const additions = await readWorldRevisionAdditionsFile(additionsPath);
        if (additions.worldId !== root.id) {
            throw new Error(
                `World revision ${pointer.revision} belongs to ${additions.worldId}, not ${root.id}.`
            );
        }
        if (additions.revision !== pointer.revision || additions.parentRevision !== pointer.parentRevision) {
            throw new Error(
                `World revision file ${pointer.file} does not match its revision pointer.`
            );
        }
        if (additions.parentRevision !== world.revision) {
            throw new Error(
                `World revision ${additions.revision} requires parent ${additions.parentRevision}, `
                + `but the resolved parent is ${world.revision}.`
            );
        }
        world = mergeAdditions(world, additions);
    }
    return world;
}

export async function writeGameWorldFile(options: {
    world: GameWorldFile;
    outputDirectory?: string;
}): Promise<string> {
    assertGameWorldFile(options.world);
    const outputDirectory = path.resolve(options.outputDirectory ?? "worlds");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${safeFileStem(options.world.id)}.world.json`);
    await writeFile(outputPath, `${JSON.stringify(options.world, null, 2)}\n`, "utf8");
    return outputPath;
}
