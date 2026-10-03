import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { getPuzzleArtifactSource, type PrivatePuzzleInstance } from "../../core/types.js";
import { createStaticUrlPuzzle } from "./engine.js";

const manipulationKindSchema = Type.Union([
    Type.Literal("query-param"),
    Type.Literal("fragment-param"),
    Type.Literal("path-segment"),
    Type.Literal("percent-decoding"),
    Type.Literal("base64-param")
]);

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
]);

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 300 }),
    { minItems: 1, maxItems: 10 }
);

const baseFields = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    visibleInstruction: Type.String({ minLength: 1, maxLength: 1000 }),
    manipulationKind: manipulationKindSchema,
    baseUrl: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    parameterName: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
    pathSegmentIndex: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
    recognitionLevel: recognitionLevelSchema,
    urlInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
} as const;

const productionSchema = Type.Object({
    mode: Type.Literal("production"),
    id: Type.String({ minLength: 1 }),
    ...baseFields
}, { additionalProperties: false });

const demoSchema = Type.Object({
    mode: Type.Literal("demo"),
    id: Type.Optional(Type.String({ minLength: 1 })),
    ...baseFields
}, { additionalProperties: false });

const parameters = Type.Union([productionSchema, demoSchema]);

export const createStaticUrlPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_static_url_puzzle",
    label: "Create a static URL puzzle",
    description: [
        "Validate an upstream puzzle ID, static URL manipulation kind, visible instruction, and hidden payload;",
        "construct a text artifact containing a safe https://example.test URL;",
        "and return the finished private hidden-information puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createStaticUrlPuzzle({
            id: params.id ?? "demo-static-url",
            intendedSolution: params.intendedSolution,
            visibleInstruction: params.visibleInstruction,
            manipulationKind: params.manipulationKind,
            baseUrl: params.baseUrl,
            parameterName: params.parameterName,
            pathSegmentIndex: params.pathSegmentIndex,
            recognitionLevel: params.recognitionLevel,
            urlInspectionHint: params.urlInspectionHint,
            acceptedAlternatives: params.acceptedAlternatives
        });

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    id: puzzle.id,
                    prompt: puzzle.prompt,
                    artifact: getPuzzleArtifactSource(puzzle.artifact),
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
