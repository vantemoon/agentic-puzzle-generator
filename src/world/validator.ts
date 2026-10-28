import Value from "typebox/value";

import {
    GameWorldSchema,
    type GameWorld,
    WORLD_SCHEMA_VERSION
} from "./types.js";

function duplicateValues(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
}

function isCalendarDate(value: string): boolean {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateGameWorld(value: unknown): string[] {
    if (!Value.Check(GameWorldSchema, value)) {
        return ["Game world does not satisfy the canonical schema."];
    }

    const world = value as GameWorld;
    const errors: string[] = [];
    if (world.schemaVersion !== WORLD_SCHEMA_VERSION) {
        errors.push(`Unsupported game-world schema version ${world.schemaVersion}; expected ${WORLD_SCHEMA_VERSION}.`);
    }

    const entityIds = world.entities.map((entity) => entity.id);
    const factIds = world.facts.map((fact) => fact.id);
    const entityIdSet = new Set(entityIds);
    for (const duplicate of duplicateValues(entityIds)) errors.push(`Duplicate world-entity ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(factIds)) errors.push(`Duplicate world-fact ID: ${duplicate}.`);

    for (const fact of world.facts) {
        if (!entityIdSet.has(fact.subjectId)) {
            errors.push(`World fact ${fact.id} references missing subject ${fact.subjectId}.`);
        }
        if (fact.value.kind === "entity") {
            if (!entityIdSet.has(fact.value.entityId)) {
                errors.push(`World fact ${fact.id} references missing entity ${fact.value.entityId}.`);
            }
            if (fact.subjectId === fact.value.entityId) {
                errors.push(`World fact ${fact.id} cannot relate an entity to itself.`);
            }
        }

        if (fact.validFrom !== undefined && !isCalendarDate(fact.validFrom)) {
            errors.push(`World fact ${fact.id} has invalid validFrom date ${fact.validFrom}.`);
        }
        if (fact.validTo !== undefined && !isCalendarDate(fact.validTo)) {
            errors.push(`World fact ${fact.id} has invalid validTo date ${fact.validTo}.`);
        }
        if (
            fact.validFrom !== undefined &&
            fact.validTo !== undefined &&
            isCalendarDate(fact.validFrom) &&
            isCalendarDate(fact.validTo) &&
            fact.validFrom > fact.validTo
        ) {
            errors.push(`World fact ${fact.id} validFrom must not be later than validTo.`);
        }
    }

    return errors;
}

export function assertGameWorld(value: unknown): asserts value is GameWorld {
    const errors = validateGameWorld(value);
    if (errors.length > 0) throw new Error(`Invalid game world:\n- ${errors.join("\n- ")}`);
}
