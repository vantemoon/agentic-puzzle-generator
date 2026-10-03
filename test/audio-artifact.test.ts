import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeWavAudioArtifactPreview } from "../src/core/audio-preview.js";
import {
    assertPrivatePuzzleInstance,
    createWavAudioArtifact,
    getPuzzleArtifactSource,
    getWavAudioData,
    type PrivatePuzzleInstance
} from "../src/core/types.js";

function silentWavBase64(): string {
    const bytes = Buffer.alloc(44);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(36, 4);
    bytes.write("WAVE", 8, "ascii");
    bytes.write("fmt ", 12, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(8000, 24);
    bytes.writeUInt32LE(16000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(0, 40);
    return bytes.toString("base64");
}

function wavPuzzle(id: string): PrivatePuzzleInstance {
    return {
        id,
        puzzleType: "audio-fixture",
        subtype: "wav-artifact-fixture",
        inputs: [],
        outputs: [{ key: "answer", valueType: "plain-text", description: "Fixture answer.", value: "OK" }],
        artifact: createWavAudioArtifact(silentWavBase64()),
        prompt: "Listen to the WAV artifact.",
        solution: { valueType: "text", canonical: "OK", normalization: ["trim"] },
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: false, collapseWhitespace: false } },
        externalKnowledge: { required: false },
        extensions: {}
    };
}

describe("WAV audio artifacts", () => {
    it("creates and validates base64 WAV audio artifacts", () => {
        const data = silentWavBase64();
        const artifact = createWavAudioArtifact(data);

        expect(artifact.kind).toBe("audio");
        expect(artifact.mediaType).toBe("audio/wav");
        expect(artifact.encoding).toBe("base64");
        expect(getWavAudioData(artifact)).toBe(data);
        expect(getPuzzleArtifactSource(artifact)).toBe(data);
    });

    it("rejects non-WAV or non-raw base64 data", () => {
        expect(() => createWavAudioArtifact("not-base64")).toThrow("base64");
        expect(() => createWavAudioArtifact(Buffer.from("hello").toString("base64"))).toThrow("RIFF/WAVE");
        expect(() => createWavAudioArtifact(`data:audio/wav;base64,${silentWavBase64()}`)).toThrow("data URLs");
    });

    it("supports private puzzle validation and WAV preview export", async () => {
        const puzzle = wavPuzzle("wav-preview-fixture");
        expect(() => assertPrivatePuzzleInstance(puzzle)).not.toThrow();

        const preview = await writeWavAudioArtifactPreview({
            puzzle,
            artifactDirectoryName: "wav-fixture",
            fallbackFileStem: "wav-preview"
        });

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "wav-fixture", "wav-preview-fixture.wav"));
            const bytes = await readFile(preview.path);
            expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
            expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
        } finally {
            await rm(preview.path, { force: true });
        }
    });
});
