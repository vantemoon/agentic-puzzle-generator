import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writePngImageArtifactPreview } from "../../core/image-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createAlphaChannelPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([Type.Literal("explicit"), Type.Literal("indirect"), Type.Literal("contextual"), Type.Literal("hidden")]);
const acceptedAlternativesSchema = Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 10 });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    coverTheme: Type.String({ minLength: 1, maxLength: 120 }),
    recognitionLevel: recognitionLevelSchema,
    alphaInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema),
    width: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 })),
    height: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 }))
}, { additionalProperties: false });

export async function writeAlphaChannelArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writePngImageArtifactPreview({ puzzle, artifactDirectoryName: "alpha-channel", fallbackFileStem: "alpha-channel-preview" });
}

export const createAlphaChannelPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_alpha_channel_puzzle",
    label: "Create an alpha-channel puzzle",
    description: "Create a PNG hidden-information puzzle with a payload encoded in the alpha channel.",
    parameters,
    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) throw new Error("Production alpha-channel puzzles require an upstream puzzle ID.");
        const puzzle = createAlphaChannelPuzzle({
            id: params.id ?? "demo-alpha-channel",
            intendedSolution: params.intendedSolution,
            coverTheme: params.coverTheme,
            recognitionLevel: params.recognitionLevel,
            alphaInspectionHint: params.alphaInspectionHint,
            acceptedAlternatives: params.acceptedAlternatives,
            width: params.width,
            height: params.height
        });
        if (params.mode === "demo") {
            const preview = await writeAlphaChannelArtifactPreview(puzzle);
            return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactPreviewPath: preview.path, artifactPreviewUrl: preview.fileUrl, answer: puzzle.solution.canonical }) }], details: puzzle };
        }
        return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactMediaType: puzzle.artifact.mediaType, answer: puzzle.solution.canonical }) }], details: puzzle };
    }
};
