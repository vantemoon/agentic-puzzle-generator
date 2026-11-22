import Value from "typebox/value";

import { safeFileStem } from "../../shared/utilities/file-names.js";
import { duplicateValues } from "../../shared/utilities/validation.js";
import { getTerminalAction } from "../level-design/action-catalog.js";
import type { PuzzleCatalog } from "../puzzle-generation/catalog.js";
import type { GameLevelManifest } from "./manifest.js";
import { validateGameLevelManifest } from "./manifest-validator.js";
import { validateLevelDesignRequest } from "../level-design/validator.js";
import { validateWorldReference } from "../level-design/world.js";
import { validateGameWorld } from "../world/validator.js";
import type { WorldEntity, WorldEntityType } from "../world/types.js";
import {
    GAME_DESIGN_SCHEMA_VERSION,
    GameDesignSpecSchema,
    type GameDesignSpec
} from "./types.js";

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

const ENTITY_ROLE_TERMS: Record<WorldEntityType, readonly string[]> = {
    person: [
        "person", "witness", "suspect", "victim", "culprit", "kidnapper", "reporter",
        "editor", "contact", "identity", "accomplice", "carrier", "orderer", "authoriz",
        "identifier", "name"
    ],
    organization: [
        "organization", "company", "agency", "institution", "vendor", "employer", "operator",
        "owner", "contractor", "assignment", "responsible", "identifier", "name"
    ],
    place: [
        "place", "location", "destination", "address", "venue", "site", "facility", "building",
        "room", "identifier", "name"
    ],
    object: [
        "object", "item", "artifact", "document", "file", "record", "evidence", "vehicle",
        "device", "identifier", "name"
    ],
    event: [
        "event", "incident", "meeting", "deadline", "date", "time", "timeline", "activity",
        "occurrence", "identifier", "name"
    ],
    site: [
        "site", "website", "page", "portal", "archive", "resource", "source", "identifier", "name"
    ]
};

const ACTIONABLE_INPUT_DESCRIPTION = /\b(?:use|using|filter|filtering|search|locate|select|compare|interpret|verify|match|identify|find|request|open|look\s+up)\b/i;

function selectedEntityForValue(
    spec: GameDesignSpec,
    levelIndex: number,
    value: string | number
): WorldEntity | undefined {
    if (typeof value !== "string") return undefined;
    const reference = spec.levels[levelIndex].request.world;
    const eligibleEntityIds = new Set(reference.entityIds);
    const factIds = new Set(reference.factIds);
    for (const fact of spec.world.facts) {
        if (factIds.has(fact.id) && fact.value.kind === "entity") {
            eligibleEntityIds.add(fact.value.entityId);
        }
    }
    return spec.world.entities.find((entity) => eligibleEntityIds.has(entity.id) && entity.name === value);
}

function roleDescribesEntityType(role: string, type: WorldEntityType): boolean {
    const normalized = role.toLowerCase();
    return ENTITY_ROLE_TERMS[type].some((term) => normalized.includes(term));
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
    if (spec.playerRole !== undefined && !/^you are\b/i.test(spec.playerRole.trim())) {
        errors.push('Game playerRole must directly address the player and begin with "You are".');
    }

    const levelIds = spec.levels.map((level) => level.request.levelId);
    for (const duplicate of duplicateValues(levelIds)) errors.push(`Duplicate game level ID: ${duplicate}.`);
    errors.push(...validateGameLevelManifest(gameManifestFromSpec(spec)));

    for (const [index, level] of spec.levels.entries()) {
        const request = level.request;
        const prefix = `Level ${request.levelId}`;
        if (spec.playerRole !== undefined && !/^you are\b/i.test(request.playerRole.trim())) {
            errors.push(`${prefix} playerRole must directly address the player and begin with "You are".`);
        }
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
        for (const input of request.startingInputs) {
            if ("value" in input && !ACTIONABLE_INPUT_DESCRIPTION.test(input.description)) {
                errors.push(
                    `${prefix} literal starting input ${input.id} must describe how a puzzle will use it `
                    + "to filter, locate, select, compare, interpret, or verify a resource; do not use a background fact as an input."
                );
            }
        }

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
            const entity = selectedEntityForValue(spec, index, discovery.value);
            if (entity !== undefined && !roleDescribesEntityType(discovery.semanticRole, entity.type)) {
                errors.push(
                    `${prefix} required discovery ${discovery.id} resolves to ${entity.type} ${JSON.stringify(entity.name)}, `
                    + `but semantic role ${JSON.stringify(discovery.semanticRole)} does not identify a ${entity.type}. `
                    + `Use a role containing one of: ${ENTITY_ROLE_TERMS[entity.type].join(", ")}.`
                );
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

