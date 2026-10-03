import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    buildMorseAudio,
    createMorseAudioPuzzle,
    extractMorsePatternFromAudio,
    normalizeMorseAudioMessage,
    normalizeMorseAudioRecognitionLevel,
    normalizeMorseAudioToneStyle
} from "../src/agents/morse-audio/engine.js";
import { createMorseAudioPuzzleTool, writeMorseAudioArtifactPreview } from "../src/agents/morse-audio/tool.js";
import { decodeMorse, encodeMorse } from "../src/agents/morse/engine.js";
import { assertPrivatePuzzleInstance, assertPublicPuzzleInstance, getWavAudioData, toPublicPuzzle, validateNormalizedTextAnswer } from "../src/core/types.js";

const spec = (id: string) => ({
    id,
    intendedSolution: "SOS 42",
    audioDescription: "shortwave beeps under static",
    recognitionLevel: "contextual" as const,
    sampleRate: 8000,
    unitDurationMs: 80,
    toneFrequencyHz: 700
});

describe("morse-audio engine", () => {
    it("normalizes fields", () => {
        expect(normalizeMorseAudioMessage(" sos   42 ")).toBe("SOS 42");
        expect(normalizeMorseAudioRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeMorseAudioToneStyle(undefined)).toBe("radio-beep");
        expect(normalizeMorseAudioToneStyle("musical-note")).toBe("musical-note");
    });

    it("generates WAV tones that decode back to Morse", () => {
        const morse = encodeMorse("SOS 42");
        const wav = buildMorseAudio({ morse, sampleRate: 8000, unitDurationMs: 80, toneFrequencyHz: 700 });
        const extracted = extractMorsePatternFromAudio(wav, 80);

        expect(extracted).toBe(morse);
        expect(decodeMorse(extracted)).toBe("SOS 42");
    });

    it("creates deterministic private WAV puzzles", () => {
        const first = createMorseAudioPuzzle(spec("morse-audio-1"));
        const second = createMorseAudioPuzzle(spec("morse-audio-1"));
        const metadata = first.extensions.morseAudio as {
            templateVersion: string;
            encoding: string;
            recognitionLevel: string;
            mediaType: string;
            audioEncoding: string;
            toneStyle: string;
            sampleRate: number;
            unitDurationMs: number;
            toneFrequencyHz: number;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("morse-audio");
        expect(first.artifact.kind).toBe("audio");
        expect(first.artifact.mediaType).toBe("audio/wav");
        expect(extractMorsePatternFromAudio(getWavAudioData(first.artifact), 80)).toBe(encodeMorse("SOS 42"));
        expect(metadata.templateVersion).toBe("morse-audio-wav-v1");
        expect(metadata.encoding).toBe("morse-tones");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.mediaType).toBe("audio/wav");
        expect(metadata.audioEncoding).toBe("base64");
        expect(metadata.toneStyle).toBe("radio-beep");
        expect(metadata.sampleRate).toBe(8000);
        expect(metadata.unitDurationMs).toBe(80);
        expect(metadata.toneFrequencyHz).toBe(700);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("validates answers and accepted alternatives", () => {
        const puzzle = createMorseAudioPuzzle({ ...spec("morse-audio-2"), intendedSolution: "CQ CQ", acceptedAlternatives: ["CQ"] });
        expect(validateNormalizedTextAnswer(puzzle, " cq   cq ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "cq")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "sos")).toBe(false);
    });

    it("creates public projection without private data", () => {
        const puzzle = createMorseAudioPuzzle(spec("morse-audio-public"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).toContain("audio/wav");
        expect(serialized).not.toContain("SOS 42");
    });

    it("enforces hint policy, leak checks, and numeric ranges", () => {
        expect(() => createMorseAudioPuzzle({ ...spec("explicit-missing"), recognitionLevel: "explicit" })).toThrow("require a Morse-audio hint");
        expect(() => createMorseAudioPuzzle({ ...spec("hidden-with-hint"), recognitionLevel: "hidden", morseAudioHint: "Listen for Morse." })).toThrow("must not include");
        expect(() => createMorseAudioPuzzle({ ...spec("leak"), audioDescription: "SOS 42 beeps" })).toThrow("must not appear");
        expect(() => createMorseAudioPuzzle({ ...spec("bad-rate"), sampleRate: 7999 })).toThrow("sample rate");
        expect(() => createMorseAudioPuzzle({ ...spec("bad-unit"), unitDurationMs: 39 })).toThrow("unit duration");
        expect(() => createMorseAudioPuzzle({ ...spec("bad-frequency"), toneFrequencyHz: 1610 })).toThrow("tone frequency");
        expect(() => normalizeMorseAudioToneStyle("noise")).toThrow("tone style");
    });

    it("exports local WAV previews and demo tool responses", async () => {
        const puzzle = createMorseAudioPuzzle(spec("morse-audio-preview"));
        const preview = await writeMorseAudioArtifactPreview(puzzle);
        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "morse-audio", "morse-audio-preview.wav"));
            const bytes = await readFile(preview.path);
            expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
            expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
        } finally {
            await rm(preview.path, { force: true });
        }

        const result = await createMorseAudioPuzzleTool.execute("tool", { mode: "demo", id: "morse-audio-tool", intendedSolution: "SOS 42", audioDescription: "shortwave beeps under static", recognitionLevel: "explicit", morseAudioHint: "Listen for Morse-code dots and dashes.", sampleRate: 8000, unitDurationMs: 80, toneFrequencyHz: 700 });
        const text = result.content[0];
        if (text.type !== "text") throw new Error("Expected text content.");
        const payload = JSON.parse(text.text) as { artifactPreviewPath: string; answer: string };
        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "morse-audio", "morse-audio-tool.wav"));
            expect(payload.answer).toBe("SOS 42");
            const wav = (await readFile(payload.artifactPreviewPath)).toString("base64");
            expect(extractMorsePatternFromAudio(wav, 80)).toBe(encodeMorse("SOS 42"));
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});
