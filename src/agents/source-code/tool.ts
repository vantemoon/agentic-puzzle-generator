import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../core/html-preview.js";
import { getHtmlEntrySource, type PrivatePuzzleInstance } from "../../core/types.js";
import { createSourceCodePuzzle } from "./engine.js";

const carrierSchema = Type.Union([
    Type.Literal("html-attribute"),
    Type.Literal("css-custom-property"),
    Type.Literal("javascript-source"),
    Type.Literal("asset-reference"),
    Type.Literal("encoded-source-value")
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
    visibleTitle: Type.String({ minLength: 1, maxLength: 120 }),
    visibleBody: Type.String({ minLength: 1, maxLength: 1000 }),
    carrier: carrierSchema,
    recognitionLevel: recognitionLevelSchema,
    sourceInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    codeLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
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

export async function writeSourceCodeArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSharedHtmlArtifactPreview({
        puzzle,
        artifactDirectoryName: "source-code",
        fallbackFileStem: "source-code-preview"
    });
}

export const createSourceCodePuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_source_code_puzzle",
    label: "Create a source-code puzzle",
    description: [
        "Validate an upstream puzzle ID, safe static source-code carrier, visible webpage context, and hidden payload;",
        "construct a static HTML artifact where the clue is in inspectable source material;",
        "and return the finished private hidden-information puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createSourceCodePuzzle({
            id: params.id ?? "demo-source-code",
            intendedSolution: params.intendedSolution,
            visibleTitle: params.visibleTitle,
            visibleBody: params.visibleBody,
            carrier: params.carrier,
            recognitionLevel: params.recognitionLevel,
            sourceInspectionHint: params.sourceInspectionHint,
            codeLabel: params.codeLabel,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writeSourceCodeArtifactPreview(puzzle);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        id: puzzle.id,
                        prompt: puzzle.prompt,
                        artifactPreviewPath: preview.path,
                        artifactPreviewUrl: preview.fileUrl,
                        answer: puzzle.solution.canonical
                    })
                }],
                details: puzzle
            };
        }

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    id: puzzle.id,
                    prompt: puzzle.prompt,
                    artifact: getHtmlEntrySource(puzzle.artifact),
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
