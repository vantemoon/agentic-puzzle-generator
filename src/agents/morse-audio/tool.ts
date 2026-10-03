import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeWavAudioArtifactPreview } from "../../core/audio-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createMorseAudioPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([Type.Literal("explicit"), Type.Literal("indirect"), Type.Literal("contextual"), Type.Literal("hidden")]);
const toneStyleSchema = Type.Union([Type.Literal("radio-beep"), Type.Literal("soft-pulse"), Type.Literal("musical-note")]);
const acceptedAlternativesSchema = Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 10 });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    audioDescription: Type.String({ minLength: 1, maxLength: 500 }),
    recognitionLevel: recognitionLevelSchema,
    morseAudioHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    toneStyle: Type.Optional(toneStyleSchema),
    sampleRate: Type.Optional(Type.Integer({ minimum: 8000, maximum: 48000 })),
    unitDurationMs: Type.Optional(Type.Integer({ minimum: 40, maximum: 250 })),
    toneFrequencyHz: Type.Optional(Type.Integer({ minimum: 220, maximum: 1600 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
}, { additionalProperties: false });

export async function writeMorseAudioArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeWavAudioArtifactPreview({ puzzle, artifactDirectoryName: "morse-audio", fallbackFileStem: "morse-audio-preview" });
}

export const createMorseAudioPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_morse_audio_puzzle",
    label: "Create a Morse-audio puzzle",
    description: "Create a WAV hidden-information puzzle where tones encode Morse-code dots and dashes.",
    parameters,
    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) throw new Error("Production Morse-audio puzzles require an upstream puzzle ID.");
        const puzzle = createMorseAudioPuzzle({
            id: params.id ?? "demo-morse-audio",
            intendedSolution: params.intendedSolution,
            audioDescription: params.audioDescription,
            recognitionLevel: params.recognitionLevel,
            morseAudioHint: params.morseAudioHint,
            toneStyle: params.toneStyle,
            sampleRate: params.sampleRate,
            unitDurationMs: params.unitDurationMs,
            toneFrequencyHz: params.toneFrequencyHz,
            acceptedAlternatives: params.acceptedAlternatives
        });
        if (params.mode === "demo") {
            const preview = await writeMorseAudioArtifactPreview(puzzle);
            return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactPreviewPath: preview.path, artifactPreviewUrl: preview.fileUrl, answer: puzzle.solution.canonical }) }], details: puzzle };
        }
        return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactMediaType: puzzle.artifact.mediaType, answer: puzzle.solution.canonical }) }], details: puzzle };
    }
};
