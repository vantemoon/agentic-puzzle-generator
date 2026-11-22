import Value from "typebox/value";
import { duplicateValues } from "../../shared/utilities/validation.js";
import { graphShape } from "../../shared/utilities/graph.js";
import { GameLevelManifestSchema, type GameLevelManifest } from "./manifest.js";
export function validateGameLevelManifest(value: unknown): string[] {
    if (!Value.Check(GameLevelManifestSchema, value)) return ["Game-level manifest does not satisfy the canonical schema."];
    const manifest = value as GameLevelManifest;
    const errors: string[] = [];
    const ids = manifest.levels.map((level) => level.id);
    const idSet = new Set(ids);
    for (const duplicate of duplicateValues(ids)) errors.push(`Duplicate level ID: ${duplicate}.`);
    const hierarchyEdges: Array<{ from: string; to: string }> = [];
    const prerequisiteEdges: Array<{ from: string; to: string }> = [];
    for (const level of manifest.levels) {
        if (level.parentLevelId !== undefined && !idSet.has(level.parentLevelId)) errors.push(`Level ${level.id} references missing parent ${level.parentLevelId}.`);
        if (level.parentLevelId === level.id) errors.push(`Level ${level.id} cannot be its own parent.`);
        if (level.parentLevelId !== undefined) hierarchyEdges.push({ from: level.parentLevelId, to: level.id });
        for (const prerequisite of level.prerequisiteLevelIds) {
            if (!idSet.has(prerequisite)) errors.push(`Level ${level.id} references missing prerequisite ${prerequisite}.`);
            if (prerequisite === level.id) errors.push(`Level ${level.id} cannot require itself.`);
            prerequisiteEdges.push({ from: prerequisite, to: level.id });
        }
    }
    if (graphShape(ids, hierarchyEdges).hasCycle) errors.push("Level hierarchy must be acyclic.");
    if (graphShape(ids, prerequisiteEdges).hasCycle) errors.push("Level prerequisites must be acyclic.");
    return errors;
}


