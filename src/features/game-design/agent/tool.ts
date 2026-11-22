import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PuzzleCatalog } from "../../puzzle-generation/catalog.js";
import { StoryArchetypeSchema } from "../../../shared/policies/house-style.js";
import { LevelDesignRequestSchema, TerminalActionRequestSchema, TerminalBriefingSchema, WorldReferenceSchema } from "../../level-design/types.js";
import { GameWorldSchema, WORLD_SCHEMA_VERSION } from "../../world/types.js";
import { writeGameDesign, type WrittenGameDesign } from "../io.js";
import {
    GAME_DESIGN_SCHEMA_VERSION,
    GameOpeningBriefingSchema,
    type GameDesignSpec
} from "../types.js";

const WorldSubmissionSchema = Type.Omit(GameWorldSchema, ["schemaVersion", "revision"], {
    additionalProperties: false
});
const RequestSubmissionBaseSchema = Type.Omit(LevelDesignRequestSchema, ["world", "catalogVersion"], {
    additionalProperties: false
});
const RequestWorldSelectionSchema = Type.Omit(WorldReferenceSchema, ["id", "revision"], {
    additionalProperties: false
});
const RequestSubmissionSchema = Type.Object({
    ...RequestSubmissionBaseSchema.properties,
    investigationQuestion: Type.String({ minLength: 1, maxLength: 240, pattern: "\\S" }),
    terminalAction: Type.Object({
        ...TerminalActionRequestSchema.properties,
        briefing: TerminalBriefingSchema
    }, { additionalProperties: false }),
    world: RequestWorldSelectionSchema
}, { additionalProperties: false });
const GameSubmissionSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    storyArchetype: StoryArchetypeSchema,
    premise: Type.String({ minLength: 1 }),
    openingBriefing: GameOpeningBriefingSchema,
    playerRole: Type.String({ minLength: 1 }),
    experienceGoals: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    world: WorldSubmissionSchema,
    levels: Type.Array(Type.Object({
        parentLevelId: Type.Optional(Type.String({ minLength: 1 })),
        prerequisiteLevelIds: Type.Array(Type.String({ minLength: 1 })),
        request: RequestSubmissionSchema
    }, { additionalProperties: false }), { minItems: 2 })
}, { additionalProperties: false });

const parameters = Type.Object({ game: GameSubmissionSchema }, { additionalProperties: false });

export interface GameDesignSubmission {
    spec: GameDesignSpec;
    files: WrittenGameDesign;
}

export function createSubmitGameDesignTool(
    catalog: PuzzleCatalog,
    rootDirectory?: string
): AgentTool<typeof parameters, GameDesignSubmission> {
    return {
        name: "submit_game_design",
        label: "Submit game design",
        description: "Validate and save a generated game world, multi-level campaign, level requests, and game manifest.",
        parameters,
        async execute(_toolCallId, params) {
            for (const { request } of params.game.levels) {
                if (!request.investigationQuestion?.trim()) {
                    throw new Error(`Level ${request.levelId} requires a concrete investigation question.`);
                }
            }
            const world: GameDesignSpec["world"] = {
                ...params.game.world,
                schemaVersion: WORLD_SCHEMA_VERSION,
                revision: "1"
            };
            const spec: GameDesignSpec = {
                schemaVersion: GAME_DESIGN_SCHEMA_VERSION,
                id: params.game.id,
                title: params.game.title,
                storyArchetype: params.game.storyArchetype,
                premise: params.game.premise,
                openingBriefing: params.game.openingBriefing,
                playerRole: params.game.playerRole,
                experienceGoals: params.game.experienceGoals,
                world,
                levels: params.game.levels.map((level) => ({
                    ...(level.parentLevelId === undefined ? {} : { parentLevelId: level.parentLevelId }),
                    prerequisiteLevelIds: level.prerequisiteLevelIds,
                    request: {
                        ...level.request,
                        world: {
                            ...level.request.world,
                            id: world.id,
                            revision: world.revision
                        },
                        catalogVersion: catalog.version
                    }
                }))
            };
            const files = await writeGameDesign({ spec, catalog, rootDirectory });
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        gameId: spec.id,
                        title: spec.title,
                        levelCount: spec.levels.length,
                        worldPath: files.worldPath,
                        requestPaths: files.requestPaths,
                        manifestPath: files.manifestPath,
                        specPath: files.specPath
                    })
                }],
                details: { spec, files },
                terminate: true
            };
        }
    };
}

