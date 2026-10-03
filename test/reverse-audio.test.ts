import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    buildSyntheticForwardAudio,
    createReverseAudioPuzzle,
    decodePcm16Wav,
    normalizeAudioDescription,
    normalizeReverseAudioMessage,
    normalizeReverseAudioRecognitionLevel,
    normalizeReversalHint,
    reversePcm16Wav
} from "../src/agents/reverse-audio/engine.js";
import {
    createReverseAudioPuzzleTool,
    writeReverseAudioArtifactPreview
} from "../src/agents/reverse-audio/tool.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getWavAudioData,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "OPEN LOCKER 7",
    audioDescription: "distorted voicemail recording",
    recognitionLevel: "contextual" as const,
    sampleRate: 8000
});

function getWavData(puzzle: ReturnType<typeof createReverseAudioPuzzle>): string {
    return getWavAudioData(puzzle.artifact);
}

describe("reverse-audio engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizeReverseAudioMessage("  OPEN   LOCKER 7  ")).toBe("OPEN LOCKER 7");
        expect(normalizeAudioDescription("  distorted   voicemail  ")).toBe("distorted voicemail");
        expect(normalizeReversalHint("  Try   reversing  ")).toBe("Try reversing");
        expect(normalizeReversalHint(undefined)).toBeUndefined();
        expect(normalizeReverseAudioRecognitionLevel("hidden")).toBe("hidden");
    });

    it("reverses PCM16 WAV audio deterministically and round trips", () => {
        const forward = buildSyntheticForwardAudio("OPEN LOCKER 7", 8000);
        const reversed = reversePcm16Wav(forward);
        const restored = reversePcm16Wav(reversed);

        expect(reversed).not.toBe(forward);
        expect(restored).toBe(forward);
        expect(decodePcm16Wav(reversed).sampleRate).toBe(8000);
    });

    it("creates a deterministic private puzzle with a direct WAV artifact", () => {
        const first = createReverseAudioPuzzle(knownSpec("reverse-audio-1"));
        const second = createReverseAudioPuzzle(knownSpec("reverse-audio-1"));
        const metadata = first.extensions.reverseAudio as {
            templateVersion: string;
            transform: string;
            recognitionLevel: string;
            mediaType: string;
            encoding: string;
            sourceKind: string;
            hasReversalHint: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("reverse-audio-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("reverse-audio");
        expect(first.artifact.kind).toBe("audio");
        expect(first.artifact.mediaType).toBe("audio/wav");
        if (first.artifact.mediaType !== "audio/wav") throw new Error("Expected WAV artifact.");
        expect(first.artifact.encoding).toBe("base64");
        expect(reversePcm16Wav(getWavData(first))).toBe(buildSyntheticForwardAudio("OPEN LOCKER 7", 8000));
        expect(metadata.templateVersion).toBe("reverse-audio-wav-v1");
        expect(metadata.transform).toBe("waveform-reversal");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.mediaType).toBe("audio/wav");
        expect(metadata.encoding).toBe("base64");
        expect(metadata.sourceKind).toBe("synthetic-voice-cue");
        expect(metadata.hasReversalHint).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createReverseAudioPuzzle(knownSpec("reverse-audio-2"));

        expect(validateNormalizedTextAnswer(puzzle, " OPEN   LOCKER 7 ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "open locker 7")).toBe(false);
    });

    it("supports accepted alternatives", () => {
        const puzzle = createReverseAudioPuzzle({
            ...knownSpec("reverse-audio-3"),
            intendedSolution: "door code 418",
            acceptedAlternatives: ["code 418"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "door code 418")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "code 418")).toBe(true);
    });

    it("creates a public projection without private metadata while retaining the WAV artifact", () => {
        const puzzle = createReverseAudioPuzzle(knownSpec("reverse-audio-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).toContain("audio/wav");
        expect(serialized).not.toContain("OPEN LOCKER 7");
    });

    it("enforces recognition hint policy and leak checks", () => {
        expect(() => createReverseAudioPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require a reversal hint");

        expect(() => createReverseAudioPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            reversalHint: "Reverse the waveform."
        })).toThrow("must not include a reversal hint");

        const explicit = createReverseAudioPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            reversalHint: "Reverse the waveform."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("reversal_hint");
        expect(explicit.prompt).toContain("Reverse the waveform");

        expect(() => createReverseAudioPuzzle({
            ...knownSpec("visible-leak"),
            audioDescription: "OPEN LOCKER 7 voicemail"
        })).toThrow("must not appear in visible public text");
    });

    it("supports supplied forward WAV audio", () => {
        const forwardAudioBase64 = buildSyntheticForwardAudio("CUSTOM", 8000);
        const puzzle = createReverseAudioPuzzle({
            ...knownSpec("provided-wav"),
            intendedSolution: "CUSTOM",
            forwardAudioBase64
        });
        const metadata = puzzle.extensions.reverseAudio as { sourceKind: string };

        expect(metadata.sourceKind).toBe("provided-wav");
        expect(reversePcm16Wav(getWavData(puzzle))).toBe(forwardAudioBase64);
    });

    it("rejects invalid values and unsupported WAV data", () => {
        expect(() => normalizeReverseAudioMessage("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeAudioDescription("   ")).toThrow("must not be empty");
        expect(() => normalizeReversalHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeReverseAudioRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => createReverseAudioPuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createReverseAudioPuzzle({ ...knownSpec("bad-rate"), sampleRate: 7999 })).toThrow("sample rate");
        expect(() => reversePcm16Wav(Buffer.from("not wav").toString("base64"))).toThrow("RIFF/WAVE");
        expect(() => reversePcm16Wav(`data:audio/wav;base64,${buildSyntheticForwardAudio("X", 8000)}`)).toThrow("data URL");
    });

    it("exports a local WAV preview file for demo viewing", async () => {
        const puzzle = createReverseAudioPuzzle(knownSpec("reverse-audio-preview"));
        const preview = await writeReverseAudioArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "reverse-audio", "reverse-audio-preview.wav"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            const bytes = await readFile(preview.path);
            expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
            expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
        } finally {
            await rm(preview.path, { force: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createReverseAudioPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "reverse-audio-tool-preview",
            intendedSolution: "OPEN LOCKER 7",
            audioDescription: "distorted voicemail recording",
            recognitionLevel: "explicit",
            reversalHint: "Try reversing the waveform.",
            sampleRate: 8000
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") throw new Error("Expected text tool content.");
        const payload = JSON.parse(textContent.text) as {
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            answer: string;
        };

        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "reverse-audio", "reverse-audio-tool-preview.wav"));
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("OPEN LOCKER 7");
            const wavData = (await readFile(payload.artifactPreviewPath)).toString("base64");
            expect(reversePcm16Wav(wavData)).toBe(buildSyntheticForwardAudio("OPEN LOCKER 7", 8000));
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});
