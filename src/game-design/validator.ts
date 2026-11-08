import Value from "typebox/value";

import { getTerminalAction } from "../levels/action-catalog.js";
import type { PuzzleCatalog } from "../levels/catalog.js";
import type { GameLevelManifest } from "../levels/types.js";
import { validateGameLevelManifest, validateLevelDesignRequest } from "../levels/validator.js";
import { validateWorldReference } from "../levels/world.js";
import { validateGameWorld } from "../world/validator.js";
import {
    GAME_DESIGN_SCHEMA_VERSION,
    GameDesignSpecSchema,
    type GameDesignSpec
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

function safeFileStem(id: string): string {
    return id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function gameManifestFromSpec(spec: GameDesignSpec): GameLevelManifest {
    return {
        schemaVersion: "1.0.0",
        gameId: spec.id,
        levels: spec.levels.map((level) => ({
            id: level.request.levelId,
            ...(level.parentLevelId === undefined ? {} : { parentLevelId: level.parentLevelId }),
            prerequisiteLevelIds: [...level.prerequisiteLevelIds],
            levelFile: `generated-levels/${safeFileStem(level.request.levelId)}.level.json`
        }))
    };
}

function selectedWorldValues(spec: GameDesignSpec, levelIndex: number): Set<string | number> {
    const reference = spec.levels[levelIndex].request.world;
    const factIds = new Set(reference.factIds);
    const entityIds = new Set(reference.entityIds);
    const values = new Set<string | number>();
    for (const entity of spec.world.entities) if (entityIds.has(entity.id)) values.add(entity.name);
    for (const fact of spec.world.facts) {
        if (!factIds.has(fact.id)) continue;
        if (fact.value.kind === "literal" && typeof fact.value.value !== "boolean") values.add(fact.value.value);
        if (fact.value.kind === "entity") {
            const entityId = fact.value.entityId;
            const entity = spec.world.entities.find((candidate) => candidate.id === entityId);
            if (entity !== undefined) values.add(entity.name);
        }
    }
    return values;
}

export function validateGameDesignSpec(value: unknown, catalog: PuzzleCatalog): string[] {
    if (!Value.Check(GameDesignSpecSchema, value)) {
        return ["Game-design spec does not satisfy the canonical schema."];
    }
    const spec = value as GameDesignSpec;
    const errors: string[] = [];
    if (spec.schemaVersion !== GAME_DESIGN_SCHEMA_VERSION) {
        errors.push(`Unsupported game-design schema version ${spec.schemaVersion}; expected ${GAME_DESIGN_SCHEMA_VERSION}.`);
    }
    errors.push(...validateGameWorld(spec.world));
    if (spec.world.entities.length === 0) errors.push("Game world must contain at least one entity.");
    if (spec.world.facts.length === 0) errors.push("Game world must contain at least one fact.");

    const levelIds = spec.levels.map((level) => level.request.levelId);
    for (const duplicate of duplicateValues(levelIds)) errors.push(`Duplicate game level ID: ${duplicate}.`);
    errors.push(...validateGameLevelManifest(gameManifestFromSpec(spec)));

    for (const [index, level] of spec.levels.entries()) {
        const request = level.request;
        const prefix = `Level ${request.levelId}`;
        for (const error of validateLevelDesignRequest(request)) errors.push(`${prefix}: ${error}`);
        if (request.catalogVersion !== catalog.version) {
            errors.push(`${prefix} uses catalog ${request.catalogVersion}; expected ${catalog.version}.`);
        }
        if (request.world.id !== spec.world.id || request.world.revision !== spec.world.revision) {
            errors.push(`${prefix} must reference generated world ${spec.world.id} revision ${spec.world.revision}.`);
        } else {
            for (const error of validateWorldReference(request.world, spec.world)) errors.push(`${prefix}: ${error}`);
        }
        if (request.startingInputs.length === 0) errors.push(`${prefix} must provide at least one starting input.`);
        if (request.requiredDiscoveries.length === 0) errors.push(`${prefix} must define at least one required discovery.`);

        const action = getTerminalAction(request.terminalAction.actionType);
        if (action === undefined) {
            errors.push(`${prefix} uses unsupported terminal action ${request.terminalAction.actionType}.`);
        } else {
            const outputs = request.terminalAction.requiredOutputs;
            if (outputs.length < action.minimumFields || outputs.length > action.maximumFields) {
                errors.push(`${prefix} terminal action ${action.id} requires ${action.minimumFields}-${action.maximumFields} fields.`);
            }
            const roles = outputs.map((output) => output.semanticRole);
            for (const role of action.requiredSemanticRoles) {
                if (!roles.includes(role)) errors.push(`${prefix} terminal action ${action.id} is missing semantic role ${role}.`);
            }
            for (const role of roles) {
                if (!action.supportedSemanticRoles.includes(role)) {
                    errors.push(`${prefix} terminal action ${action.id} does not support semantic role ${role}.`);
                }
            }
        }

        const worldValues = selectedWorldValues(spec, index);
        for (const discovery of request.requiredDiscoveries) {
            if (!worldValues.has(discovery.value)) {
                errors.push(`${prefix} required discovery ${discovery.id} is not grounded in its selected world facts or entities.`);
            }
        }
        for (const output of request.terminalAction.requiredOutputs) {
            if (output.requiredValue === undefined) {
                errors.push(`${prefix} terminal output ${output.id} must define requiredValue.`);
            } else if (!worldValues.has(output.requiredValue)) {
                errors.push(`${prefix} terminal output ${output.id} is not grounded in its selected world facts or entities.`);
            }
        }
    }
    return errors;
}

export function assertGameDesignSpec(value: unknown, catalog: PuzzleCatalog): asserts value is GameDesignSpec {
    const errors = validateGameDesignSpec(value, catalog);
    if (errors.length > 0) throw new Error(`Invalid game design:\n- ${errors.join("\n- ")}`);
}

