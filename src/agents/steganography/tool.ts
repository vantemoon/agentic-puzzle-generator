import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writePngImageArtifactPreview } from "../../core/image-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createSteganographyPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
], { description: "How directly the public prompt should point solvers toward image steganography." });

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 300 }),
    { minItems: 1, maxItems: 10, description: "Optional alternative payload answers accepted by the validator." }
);

const baseFields = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    coverTheme: Type.String({ minLength: 1, maxLength: 120 }),
    recognitionLevel: recognitionLevelSchema,
    extractionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema),
    width: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 })),
    height: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 }))
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

export async function writeSteganographyArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writePngImageArtifactPreview({
        puzzle,
        artifactDirectoryName: "steganography",
        fallbackFileStem: "steganography-preview"
    });
}

export const createSteganographyPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_steganography_puzzle",
    label: "Create a steganography puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden text payload, PNG cover theme, and recognition level;",
        "construct a deterministic PNG image artifact with the payload embedded in RGB least significant bits;",
        "and return the finished private hidden-information puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createSteganographyPuzzle({
            id: params.id ?? "demo-steganography",
            intendedSolution: params.intendedSolution,
            coverTheme: params.coverTheme,
            recognitionLevel: params.recognitionLevel,
            extractionHint: params.extractionHint,
            acceptedAlternatives: params.acceptedAlternatives,
            width: params.width,
            height: params.height
        });

        if (params.mode === "demo") {
            const preview = await writeSteganographyArtifactPreview(puzzle);
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
                    artifactMediaType: puzzle.artifact.mediaType,
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
