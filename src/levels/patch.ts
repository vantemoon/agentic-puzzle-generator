import Value from "typebox/value";

import { LevelPatchSchema, type LevelBlueprint, type LevelPatch } from "./types.js";

function pathSegments(path: string): string[] {
    return path.split("/").slice(1).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function validateLevelPatch(patch: unknown, level: LevelBlueprint): string[] {
    if (!Value.Check(LevelPatchSchema, patch)) return ["Patch does not satisfy the canonical level-patch schema."];
    const candidate = patch as LevelPatch;
    const errors: string[] = [];
    if (candidate.levelId !== level.id) errors.push(`Patch level ID must be ${level.id}.`);
    if (candidate.baseSchemaVersion !== level.schemaVersion) errors.push("Patch base schema version does not match the level.");
    if (candidate.mode === "full-regeneration" && candidate.unrecoverableIssue === undefined) {
        errors.push("Full regeneration requires an unrecoverableIssue explanation.");
    }
    if (candidate.mode === "progress-preserving") {
        const completed = new Set(candidate.completedPuzzleIds);
        for (const id of completed) {
            if (!level.puzzles.some((puzzle) => puzzle.id === id)) errors.push(`Completed puzzle ${id} does not exist in the level.`);
        }
        for (const operation of candidate.operations) {
            const segments = pathSegments(operation.path);
            if (segments[0] === "puzzles" && segments[1] !== undefined && completed.has(segments[1])) {
                errors.push(`Progress-preserving patch cannot modify completed puzzle ${segments[1]}.`);
            }
            const terminalReady = level.terminalAction.fields.every((field) => completed.has(field.source.puzzleId));
            if (segments[0] === "terminalAction" && terminalReady) {
                errors.push("Progress-preserving patch cannot modify a terminal action whose source puzzles are complete.");
            }
        }
    }
    return errors;
}
