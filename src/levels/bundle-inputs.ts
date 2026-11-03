import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PrivatePuzzleInstance } from "../core/types.js";
import { readGameWorldFile } from "../world/io.js";
import type { GameWorld } from "../world/types.js";
import { getPuzzleCatalogEntry, type PuzzleCatalog } from "./catalog.js";
import {
    createPuzzleGenerationHandoff,
    generatedPuzzleArtifactDirectory,
    generatedPuzzleArtifactEntryPath,
    generatedPuzzlePath,
    validateGeneratedPuzzle
} from "./puzzle-generation.js";
import type { LevelBlueprint } from "./types.js";
import { assertLevelBlueprint } from "./validator.js";
import { resolveLevelWorld, type LevelWorldContext } from "./world.js";

export interface LoadedBundlePuzzle {
    puzzle: PrivatePuzzleInstance;
    metadataFile: string;
    artifactDirectory: string;
    artifactEntryFile: string;
}

export interface LevelBundleInputs {
    level: LevelBlueprint;
    world: GameWorld;
    context: LevelWorldContext;
    worldFile: string;
    puzzles: LoadedBundlePuzzle[];
}

export class LevelBundlePreflightError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
        super(`Level bundle preflight failed:\n- ${issues.join("\n- ")}`);
        this.name = "LevelBundlePreflightError";
        this.issues = issues;
    }
}

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("ID cannot be converted to a safe filename.");
    return stem;
}

async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function artifactKindMatchesCatalog(
    puzzle: PrivatePuzzleInstance,
    catalog: PuzzleCatalog
): string | undefined {
    const entry = getPuzzleCatalogEntry(catalog, puzzle.subtype);
    if (entry === undefined) return `No catalog entry exists for generated puzzle subtype ${puzzle.subtype}.`;
    const kind = puzzle.artifact.kind;
    if (entry.bundle.integrity === "text-content" && kind !== "text") {
        return `Puzzle ${puzzle.id} requires text-content integrity but generated ${kind}.`;
    }
    if (entry.bundle.integrity === "html-source" && kind !== "html") {
        return `Puzzle ${puzzle.id} requires html-source integrity but generated ${kind}.`;
    }
    if (entry.bundle.integrity === "exact-file" && kind !== "image" && kind !== "audio") {
        return `Puzzle ${puzzle.id} requires exact-file integrity but generated ${kind}.`;
    }
    return undefined;
}

function safeArtifactRelativePath(value: string): string | undefined {
    const relative = value.replace(/^\/+/, "");
    if (relative.length === 0) return undefined;
    const segments = relative.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
    if (relative.includes("\\")) return undefined;
    return relative;
}

async function verifyArtifactFiles(
    levelId: string,
    puzzle: PrivatePuzzleInstance,
    rootDirectory: string
): Promise<string[]> {
    const errors: string[] = [];
    const artifactDirectory = generatedPuzzleArtifactDirectory(levelId, puzzle.id, rootDirectory);
    const artifact = puzzle.artifact;

    if (artifact.kind === "html") {
        for (const file of artifact.files) {
            const relative = safeArtifactRelativePath(file.path);
            if (relative === undefined) {
                errors.push(`Puzzle ${puzzle.id} contains unsafe artifact path ${file.path}.`);
                continue;
            }
            const filePath = path.join(artifactDirectory, relative);
            try {
                const actual = await readFile(filePath, "utf8");
                if (actual !== file.source) errors.push(`Puzzle ${puzzle.id} artifact file ${file.path} differs from its private record.`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errors.push(`Puzzle ${puzzle.id} artifact file ${file.path} is unavailable: ${message}`);
            }
        }
        return errors;
    }

    const entryPath = generatedPuzzleArtifactEntryPath(levelId, puzzle, rootDirectory);
    try {
        if (artifact.kind === "text") {
            if (await readFile(entryPath, "utf8") !== artifact.source) {
                errors.push(`Puzzle ${puzzle.id} text artifact differs from its private record.`);
            }
        } else if (artifact.kind === "audio" || artifact.mediaType === "image/png") {
            const expected = Buffer.from(artifact.data, "base64");
            if (!expected.equals(await readFile(entryPath))) {
                errors.push(`Puzzle ${puzzle.id} binary artifact differs from its private record.`);
            }
        } else if (await readFile(entryPath, "utf8") !== artifact.source) {
            errors.push(`Puzzle ${puzzle.id} SVG artifact differs from its private record.`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Puzzle ${puzzle.id} artifact entry file is unavailable: ${message}`);
    }
    return errors;
}

async function loadGeneratedPuzzle(options: {
    level: LevelBlueprint;
    puzzleId: string;
    catalog: PuzzleCatalog;
    generatedPuzzleDirectory: string;
}): Promise<{ loaded?: LoadedBundlePuzzle; issues: string[] }> {
    const metadataFile = generatedPuzzlePath(
        options.level.id,
        options.puzzleId,
        options.generatedPuzzleDirectory
    );
    let value: unknown;
    try {
        value = await readJson(metadataFile);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { issues: [`Puzzle ${options.puzzleId} metadata is unavailable or invalid at ${metadataFile}: ${message}`] };
    }

    let puzzle: PrivatePuzzleInstance;
    try {
        const handoff = createPuzzleGenerationHandoff(options.level, options.puzzleId, options.catalog);
        puzzle = validateGeneratedPuzzle(handoff, value);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { issues: [`Puzzle ${options.puzzleId} failed generated-puzzle validation: ${message}`] };
    }

    const issues: string[] = [];
    const compatibilityIssue = artifactKindMatchesCatalog(puzzle, options.catalog);
    if (compatibilityIssue !== undefined) issues.push(compatibilityIssue);
    issues.push(...await verifyArtifactFiles(
        options.level.id,
        puzzle,
        options.generatedPuzzleDirectory
    ));
    if (issues.length > 0) return { issues };

    return {
        issues: [],
        loaded: {
            puzzle,
            metadataFile,
            artifactDirectory: generatedPuzzleArtifactDirectory(
                options.level.id,
                puzzle.id,
                options.generatedPuzzleDirectory
            ),
            artifactEntryFile: generatedPuzzleArtifactEntryPath(
                options.level.id,
                puzzle,
                options.generatedPuzzleDirectory
            )
        }
    };
}

export async function loadLevelBundleInputs(options: {
    levelFile: string;
    catalog: PuzzleCatalog;
    worldDirectory?: string;
    generatedPuzzleDirectory?: string;
}): Promise<LevelBundleInputs> {
    const levelFile = path.resolve(options.levelFile);
    const level = await readJson(levelFile);
    assertLevelBlueprint(level, options.catalog);

    const worldDirectory = path.resolve(options.worldDirectory ?? "worlds");
    const worldFile = path.join(worldDirectory, `${safeFileStem(level.world.id)}.world.json`);
    const world = await readGameWorldFile(worldFile, { revision: level.world.revision });
    const context = resolveLevelWorld(level.world, world);
    const generatedPuzzleDirectory = path.resolve(options.generatedPuzzleDirectory ?? "generated-puzzles");

    const results = await Promise.all(level.puzzles.map((puzzle) => loadGeneratedPuzzle({
        level,
        puzzleId: puzzle.id,
        catalog: options.catalog,
        generatedPuzzleDirectory
    })));
    const issues = results.flatMap((result) => result.issues);
    if (issues.length > 0) throw new LevelBundlePreflightError(issues);

    return {
        level,
        world,
        context,
        worldFile,
        puzzles: results.map((result) => result.loaded as LoadedBundlePuzzle)
    };
}
