import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writePngImageArtifactPreview } from "../../core/image-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createColorChannelPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([Type.Literal("explicit"), Type.Literal("indirect"), Type.Literal("contextual"), Type.Literal("hidden")]);
const channelSchema = Type.Union([Type.Literal("red"), Type.Literal("green"), Type.Literal("blue")]);
const acceptedAlternativesSchema = Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 10 });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    coverTheme: Type.String({ minLength: 1, maxLength: 120 }),
    channel: channelSchema,
    recognitionLevel: recognitionLevelSchema,
    channelInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema),
    width: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 })),
    height: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 }))
}, { additionalProperties: false });

export async function writeColorChannelArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writePngImageArtifactPreview({ puzzle, artifactDirectoryName: "color-channel", fallbackFileStem: "color-channel-preview" });
}

export const createColorChannelPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_color_channel_puzzle",
    label: "Create a color-channel puzzle",
    description: "Create a PNG hidden-information puzzle with a payload encoded in one RGB channel.",
    parameters,
    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) throw new Error("Production color-channel puzzles require an upstream puzzle ID.");
        const puzzle = createColorChannelPuzzle({
            id: params.id ?? "demo-color-channel",
            intendedSolution: params.intendedSolution,
            coverTheme: params.coverTheme,
            channel: params.channel,
            recognitionLevel: params.recognitionLevel,
            channelInspectionHint: params.channelInspectionHint,
            acceptedAlternatives: params.acceptedAlternatives,
            width: params.width,
            height: params.height
        });
        if (params.mode === "demo") {
            const preview = await writeColorChannelArtifactPreview(puzzle);
            return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactPreviewPath: preview.path, artifactPreviewUrl: preview.fileUrl, answer: puzzle.solution.canonical }) }], details: puzzle };
        }
        return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactMediaType: puzzle.artifact.mediaType, answer: puzzle.solution.canonical }) }], details: puzzle };
    }
};
