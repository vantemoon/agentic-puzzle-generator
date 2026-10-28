import type { GameWorld, WorldEntity, WorldFact } from "../world/types.js";
import { validateGameWorld } from "../world/validator.js";
import type { WorldReference } from "./types.js";

export interface LevelWorldContext {
    id: string;
    revision: string;
    asOf?: string;
    entities: WorldEntity[];
    facts: WorldFact[];
}

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

export function validateWorldReference(reference: WorldReference, world: GameWorld): string[] {
    const worldErrors = validateGameWorld(world);
    if (worldErrors.length > 0) return worldErrors.map((error) => `Game world: ${error}`);

    const errors: string[] = [];
    if (reference.id !== world.id) {
        errors.push(`World reference ID ${reference.id} does not match loaded world ${world.id}.`);
    }
    if (reference.revision !== world.revision) {
        errors.push(`World reference revision ${reference.revision} does not match loaded revision ${world.revision}.`);
    }

    for (const duplicate of duplicateValues(reference.entityIds)) {
        errors.push(`Duplicate referenced world-entity ID: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(reference.factIds)) {
        errors.push(`Duplicate referenced world-fact ID: ${duplicate}.`);
    }

    const worldEntityIds = new Set(world.entities.map((entity) => entity.id));
    const worldFacts = new Map(world.facts.map((fact) => [fact.id, fact]));
    const referencedEntityIds = new Set(reference.entityIds);
    for (const entityId of reference.entityIds) {
        if (!worldEntityIds.has(entityId)) errors.push(`World reference includes missing entity ${entityId}.`);
    }
    for (const factId of reference.factIds) {
        const fact = worldFacts.get(factId);
        if (fact === undefined) {
            errors.push(`World reference includes missing fact ${factId}.`);
            continue;
        }
        if (!referencedEntityIds.has(fact.subjectId)) {
            errors.push(`Referenced fact ${factId} requires unselected subject ${fact.subjectId}.`);
        }
        if (fact.value.kind === "entity" && !referencedEntityIds.has(fact.value.entityId)) {
            errors.push(`Referenced fact ${factId} requires unselected entity ${fact.value.entityId}.`);
        }
    }

    if (reference.asOf !== undefined) {
        if (!isCalendarDate(reference.asOf)) {
            errors.push(`World reference has invalid asOf date ${reference.asOf}.`);
        } else {
            for (const factId of reference.factIds) {
                const fact = worldFacts.get(factId);
                if (fact === undefined) continue;
                if (fact.validFrom !== undefined && fact.validFrom > reference.asOf) {
                    errors.push(`Referenced fact ${factId} is not valid as of ${reference.asOf}.`);
                }
                if (fact.validTo !== undefined && fact.validTo < reference.asOf) {
                    errors.push(`Referenced fact ${factId} is not valid as of ${reference.asOf}.`);
                }
            }
        }
    }

    return errors;
}

export function resolveLevelWorld(reference: WorldReference, world: GameWorld): LevelWorldContext {
    const errors = validateWorldReference(reference, world);
    if (errors.length > 0) throw new Error(`Invalid level world reference:\n- ${errors.join("\n- ")}`);

    const entityIds = new Set(reference.entityIds);
    const factIds = new Set(reference.factIds);
    return {
        id: world.id,
        revision: world.revision,
        ...(reference.asOf === undefined ? {} : { asOf: reference.asOf }),
        entities: world.entities.filter((entity) => entityIds.has(entity.id)),
        facts: world.facts.filter((fact) => factIds.has(fact.id))
    };
}
