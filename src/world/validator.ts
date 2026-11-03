import Value from "typebox/value";

import {
    GameWorldFileSchema,
    GameWorldSchema,
    WorldRevisionAdditionsSchema,
    type GameWorldFile,
    type GameWorld,
    type WorldFact,
    type WorldRevisionAdditions,
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

function validateFactDates(facts: WorldFact[], prefix: string): string[] {
    const errors: string[] = [];
    for (const fact of facts) {
        if (fact.validFrom !== undefined && !isCalendarDate(fact.validFrom)) {
            errors.push(`${prefix} ${fact.id} has invalid validFrom date ${fact.validFrom}.`);
        }
        if (fact.validTo !== undefined && !isCalendarDate(fact.validTo)) {
            errors.push(`${prefix} ${fact.id} has invalid validTo date ${fact.validTo}.`);
        }
        if (
            fact.validFrom !== undefined &&
            fact.validTo !== undefined &&
            isCalendarDate(fact.validFrom) &&
            isCalendarDate(fact.validTo) &&
            fact.validFrom > fact.validTo
        ) {
            errors.push(`${prefix} ${fact.id} validFrom must not be later than validTo.`);
        }
    }
    return errors;
}

function safeRelativeFile(value: string): boolean {
    return !value.startsWith("/")
        && !value.includes("\\")
        && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
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

    }

    errors.push(...validateFactDates(world.facts, "World fact"));

    return errors;
}

export function validateGameWorldFile(value: unknown): string[] {
    if (!Value.Check(GameWorldFileSchema, value)) {
        return ["Game-world file does not satisfy the canonical schema."];
    }
    const file = value as GameWorldFile;
    const { revisionPointers: _pointers, ...baseWorld } = file;
    const errors = validateGameWorld(baseWorld);
    const revisions = [file.revision, ...(file.revisionPointers ?? []).map((pointer) => pointer.revision)];
    for (const duplicate of duplicateValues(revisions)) {
        errors.push(`Duplicate game-world revision: ${duplicate}.`);
    }
    let parentRevision = file.revision;
    for (const pointer of file.revisionPointers ?? []) {
        if (pointer.parentRevision !== parentRevision) {
            errors.push(
                `World revision ${pointer.revision} has parent ${pointer.parentRevision}; expected ${parentRevision}.`
            );
        }
        if (!safeRelativeFile(pointer.file)) {
            errors.push(`World revision ${pointer.revision} has unsafe file pointer ${pointer.file}.`);
        }
        parentRevision = pointer.revision;
    }
    return errors;
}

export function validateWorldRevisionAdditions(value: unknown): string[] {
    if (!Value.Check(WorldRevisionAdditionsSchema, value)) {
        return ["World-revision additions do not satisfy the canonical schema."];
    }
    const additions = value as WorldRevisionAdditions;
    const errors: string[] = [];
    if (additions.schemaVersion !== WORLD_SCHEMA_VERSION) {
        errors.push(
            `Unsupported game-world schema version ${additions.schemaVersion}; expected ${WORLD_SCHEMA_VERSION}.`
        );
    }
    if (additions.entities.length === 0 && additions.facts.length === 0) {
        errors.push(`World revision ${additions.revision} contains no additions.`);
    }
    for (const duplicate of duplicateValues(additions.entities.map((entity) => entity.id))) {
        errors.push(`Duplicate added world-entity ID: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(additions.facts.map((fact) => fact.id))) {
        errors.push(`Duplicate added world-fact ID: ${duplicate}.`);
    }
    for (const fact of additions.facts) {
        if (fact.value.kind === "entity" && fact.subjectId === fact.value.entityId) {
            errors.push(`World fact ${fact.id} cannot relate an entity to itself.`);
        }
    }
    errors.push(...validateFactDates(additions.facts, "World fact"));
    return errors;
}

export function assertGameWorld(value: unknown): asserts value is GameWorld {
    const errors = validateGameWorld(value);
    if (errors.length > 0) throw new Error(`Invalid game world:\n- ${errors.join("\n- ")}`);
}

export function assertGameWorldFile(value: unknown): asserts value is GameWorldFile {
    const errors = validateGameWorldFile(value);
    if (errors.length > 0) throw new Error(`Invalid game world file:\n- ${errors.join("\n- ")}`);
}

export function assertWorldRevisionAdditions(value: unknown): asserts value is WorldRevisionAdditions {
    const errors = validateWorldRevisionAdditions(value);
    if (errors.length > 0) throw new Error(`Invalid world-revision additions:\n- ${errors.join("\n- ")}`);
}
