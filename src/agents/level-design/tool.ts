import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PuzzleCatalog } from "../../levels/catalog.js";
import { writeLevelBlueprintFile, writeLevelDesignFailureFile } from "../../levels/io.js";
import {
    LevelBlueprintSchema,
    LevelDesignFailureSchema,
    LEVEL_SCHEMA_VERSION,
    TerminalActionSchema,
    type LevelBlueprint,
    type LevelDesignFailure,
    type LevelDesignRequest
} from "../../levels/types.js";
import { validateLevelAgainstRequest } from "../../levels/validator.js";

const LevelBlueprintSubmissionBaseSchema = Type.Omit(LevelBlueprintSchema, [
    "schemaVersion",
    "catalogVersion",
    "id",
    "world",
    "genre",
    "environment",
    "startingSituation",
    "playerRole",
    "playerCapabilities",
    "playerConstraints",
    "startingInputs",
    "generationConfig",
    "externalContentRequirements",
    "terminalAction"
], { additionalProperties: false });
const LevelBlueprintSubmissionSchema = Type.Object({
    ...LevelBlueprintSubmissionBaseSchema.properties,
    terminalAction: Type.Omit(TerminalActionSchema, ["actionType", "description"], {
        additionalProperties: false
    })
}, { additionalProperties: false });
const LevelDesignFailureSubmissionSchema = Type.Omit(LevelDesignFailureSchema, ["schemaVersion"], { additionalProperties: false });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    result: Type.Union([
        Type.Object({ status: Type.Literal("success"), blueprint: LevelBlueprintSubmissionSchema }, { additionalProperties: false }),
        LevelDesignFailureSubmissionSchema
    ])
}, { additionalProperties: false });

export interface LevelDesignSubmission {
    mode: "production" | "demo";
    result: { status: "success"; blueprint: LevelBlueprint } | LevelDesignFailure;
    outputPath: string;
}

type LevelDesignRequestSource = LevelDesignRequest | (() => LevelDesignRequest | undefined);

function currentRequest(source: LevelDesignRequestSource | undefined): LevelDesignRequest | undefined {
    return typeof source === "function" ? source() : source;
}

export function createSubmitLevelBlueprintTool(
    catalog: PuzzleCatalog,
    requestSource?: LevelDesignRequestSource,
    outputDirectory?: string
): AgentTool<typeof parameters, LevelDesignSubmission> {
    return {
        name: "submit_level_design",
        label: "Submit level design result",
        description: "Validate and save either a private metadata-only level blueprint or a structured request-revision report.",
        parameters,

        async execute(_toolCallId, params) {
            const request = currentRequest(requestSource);
            if (request === undefined) {
                throw new Error("Level design requires a validated level-design request.");
            }
            if (params.result.status === "needs-game-design-revision") {
                const failure: LevelDesignFailure = {
                    ...params.result,
                    schemaVersion: LEVEL_SCHEMA_VERSION
                };
                if (failure.requestId !== request.levelId) {
                    throw new Error(`Rejection requestId must be ${request.levelId}.`);
                }
                const outputPath = await writeLevelDesignFailureFile({ failure, outputDirectory });
                return {
                    content: [{ type: "text", text: `Level rejection JSON: ${outputPath}` }],
                    details: { mode: params.mode, result: failure, outputPath },
                    terminate: true
                };
            }

            const blueprint: LevelBlueprint = {
                ...params.result.blueprint,
                schemaVersion: LEVEL_SCHEMA_VERSION,
                catalogVersion: request.catalogVersion,
                id: request.levelId,
                world: structuredClone(request.world),
                genre: request.genre,
                environment: structuredClone(request.environment),
                startingSituation: request.startingSituation,
                playerRole: request.playerRole,
                playerCapabilities: structuredClone(request.playerCapabilities),
                playerConstraints: structuredClone(request.playerConstraints),
                startingInputs: structuredClone(request.startingInputs),
                generationConfig: structuredClone(request.config),
                externalContentRequirements: structuredClone(request.externalContentRequirements),
                setting: {
                    ...params.result.blueprint.setting,
                    ...(request.theme === undefined ? {} : { theme: request.theme }),
                    ...(request.setting === undefined ? {} : { location: request.setting })
                },
                terminalAction: {
                    ...params.result.blueprint.terminalAction,
                    actionType: request.terminalAction.actionType,
                    description: request.terminalAction.description
                }
            };
            const errors = validateLevelAgainstRequest(blueprint, request, catalog);
            if (errors.length > 0) throw new Error(`Level blueprint was rejected:\n- ${errors.join("\n- ")}`);
            const outputPath = await writeLevelBlueprintFile({
                level: blueprint,
                catalog,
                outputDirectory
            });
            return {
                content: [{
                    type: "text",
                    text: params.mode === "demo"
                        ? `Level JSON: ${outputPath}`
                        : JSON.stringify({
                            id: blueprint.id,
                            title: blueprint.title,
                            phaseCount: blueprint.phases.length,
                            puzzleCount: blueprint.puzzles.length,
                            terminalActionId: blueprint.terminalAction.id,
                            outputPath,
                            status: "validated-metadata"
                        })
                }],
                details: { mode: params.mode, result: { status: "success", blueprint }, outputPath },
                terminate: true
            };
        }
    };
}
