import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../core/html-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createAltTextPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
], { description: "How directly the visible page should point solvers toward image alt-text inspection." });

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 300 }),
    {
        minItems: 1,
        maxItems: 10,
        description: "Optional alternative extracted messages accepted by the validator."
    }
);

const baseFields = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    visibleTitle: Type.String({ minLength: 1, maxLength: 120 }),
    visibleBody: Type.String({ minLength: 1, maxLength: 1000 }),
    imageLabel: Type.String({ minLength: 1, maxLength: 120 }),
    recognitionLevel: recognitionLevelSchema,
    altInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    imageCaption: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
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

export async function writeAltTextArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSharedHtmlArtifactPreview({
        puzzle,
        artifactDirectoryName: "alt-text",
        fallbackFileStem: "alt-text-preview"
    });
}

export const createAltTextPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_alt_text_puzzle",
    label: "Create an alt-text puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden alt-text payload, visible webpage text, image label, and recognition level;",
        "construct a safe static HTML artifact with the payload hidden in one image alt attribute;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createAltTextPuzzle({
            id: params.id ?? "demo-alt-text",
            intendedSolution: params.intendedSolution,
            visibleTitle: params.visibleTitle,
            visibleBody: params.visibleBody,
            imageLabel: params.imageLabel,
            recognitionLevel: params.recognitionLevel,
            altInspectionHint: params.altInspectionHint,
            imageCaption: params.imageCaption,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writeAltTextArtifactPreview(puzzle);

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
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
