import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PuzzleCatalog } from "../../levels/catalog.js";
import { writeLevelBlueprintFile, writeLevelDesignFailureFile } from "../../levels/io.js";
import {
    LevelBlueprintSchema,
    LevelDesignFailureSchema,
    type LevelBlueprint,
    type LevelDesignFailure,
    type LevelDesignRequest
} from "../../levels/types.js";
import { validateLevelAgainstRequest, validateLevelBlueprint } from "../../levels/validator.js";

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    result: Type.Union([
        Type.Object({ status: Type.Literal("success"), blueprint: LevelBlueprintSchema }, { additionalProperties: false }),
        LevelDesignFailureSchema
    ])
}, { additionalProperties: false });

export interface LevelDesignSubmission {
    mode: "production" | "demo";
    result: { status: "success"; blueprint: LevelBlueprint } | LevelDesignFailure;
    outputPath: string;
}

export function createSubmitLevelBlueprintTool(
    catalog: PuzzleCatalog,
    request?: LevelDesignRequest,
    outputDirectory?: string
): AgentTool<typeof parameters, LevelDesignSubmission> {
    return {
        name: "submit_level_design",
        label: "Submit level design result",
        description: "Validate and save either a private metadata-only level blueprint or a structured request-revision report.",
        parameters,

        async execute(_toolCallId, params) {
            if (params.result.status === "needs-game-design-revision") {
                if (request !== undefined && params.result.requestId !== request.levelId) {
                    throw new Error(`Rejection requestId must be ${request.levelId}.`);
                }
                const outputPath = await writeLevelDesignFailureFile({ failure: params.result, outputDirectory });
                return {
                    content: [{ type: "text", text: `Level rejection JSON: ${outputPath}` }],
                    details: { mode: params.mode, result: params.result, outputPath },
                    terminate: true
                };
            }

            const blueprint = params.result.blueprint;
            const errors = request === undefined
                ? validateLevelBlueprint(blueprint, catalog)
                : validateLevelAgainstRequest(blueprint, request, catalog);
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
                details: { mode: params.mode, result: params.result, outputPath },
                terminate: true
            };
        }
    };
}
