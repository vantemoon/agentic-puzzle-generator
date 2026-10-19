import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeWavAudioArtifactPreview } from "../../core/audio-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createReverseAudioPuzzle } from "./engine.js";

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 300 }),
    { minItems: 1, maxItems: 10, description: "Optional alternative recovered messages accepted by the validator." }
);

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    audioDescription: Type.String({ minLength: 1, maxLength: 500 }),
    forwardAudioBase64: Type.Optional(Type.String({ minLength: 1 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema),
    sampleRate: Type.Optional(Type.Integer({ minimum: 8000, maximum: 48000 }))
}, { additionalProperties: false });

export async function writeReverseAudioArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeWavAudioArtifactPreview({
        puzzle,
        artifactDirectoryName: "reverse-audio",
        fallbackFileStem: "reverse-audio-preview"
    });
}

export const createReverseAudioPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_reverse_audio_puzzle",
    label: "Create a reverse audio puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden message, WAV audio description, and optional forward WAV;",
        "construct a WAV audio artifact by reversing the waveform;",
        "and return the finished private hidden-information puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) {
            throw new Error("Production reverse-audio puzzles require an upstream puzzle ID.");
        }

        const puzzle = createReverseAudioPuzzle({
            id: params.id ?? "demo-reverse-audio",
            intendedSolution: params.intendedSolution,
            audioDescription: params.audioDescription,
            forwardAudioBase64: params.forwardAudioBase64,
            acceptedAlternatives: params.acceptedAlternatives,
            sampleRate: params.sampleRate
        });

        if (params.mode === "demo") {
            const preview = await writeReverseAudioArtifactPreview(puzzle);
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
