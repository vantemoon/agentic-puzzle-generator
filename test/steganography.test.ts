import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    createSteganographyPuzzle,
    embedPngLsbRgb,
    extractPngLsbRgbPayload,
    normalizeCoverTheme,
    normalizeSteganographyHint,
    normalizeSteganographyPayload,
    normalizeSteganographyRecognitionLevel
} from "../src/agents/steganography/engine.js";
import {
    createSteganographyPuzzleTool,
    writeSteganographyArtifactPreview
} from "../src/agents/steganography/tool.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getPngImageData,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "OPEN LOCKER 7",
    coverTheme: "quiet landscape",
    recognitionLevel: "contextual" as const,
    width: 64,
    height: 48
});

function getPngData(puzzle: ReturnType<typeof createSteganographyPuzzle>): string {
    return getPngImageData(puzzle.artifact);
}

describe("steganography engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizeSteganographyPayload("  OPEN   LOCKER 7  ")).toBe("OPEN LOCKER 7");
        expect(normalizeCoverTheme("  quiet   landscape  ")).toBe("quiet landscape");
        expect(normalizeSteganographyHint("  Check   LSBs  ")).toBe("Check LSBs");
        expect(normalizeSteganographyHint(undefined)).toBeUndefined();
        expect(normalizeSteganographyRecognitionLevel("hidden")).toBe("hidden");
    });

    it("embeds and extracts PNG LSB RGB payloads deterministically", () => {
        const first = embedPngLsbRgb({ width: 64, height: 48, coverTheme: "quiet landscape", payload: "OPEN LOCKER 7" });
        const second = embedPngLsbRgb({ width: 64, height: 48, coverTheme: "quiet landscape", payload: "OPEN LOCKER 7" });

        expect(first).toBe(second);
        expect(Buffer.from(first, "base64").subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        expect(extractPngLsbRgbPayload(first)).toBe("OPEN LOCKER 7");
    });

    it("creates a deterministic private puzzle with a direct PNG image artifact", () => {
        const first = createSteganographyPuzzle(knownSpec("stego-1"));
        const second = createSteganographyPuzzle(knownSpec("stego-1"));
        const metadata = first.extensions.steganography as {
            templateVersion: string;
            embeddingMethod: string;
            recognitionLevel: string;
            imageFormat: string;
            encoding: string;
            width: number;
            height: number;
            hasExtractionHint: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("stego-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("steganography");
        expect(first.artifact.kind).toBe("image");
        expect(first.artifact.mediaType).toBe("image/png");
        if (first.artifact.mediaType !== "image/png") throw new Error("Expected PNG artifact.");
        expect(first.artifact.encoding).toBe("base64");
        expect(extractPngLsbRgbPayload(getPngData(first))).toBe("OPEN LOCKER 7");
        expect(metadata.templateVersion).toBe("png-lsb-rgb-v1");
        expect(metadata.embeddingMethod).toBe("png-lsb-rgb");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.imageFormat).toBe("png");
        expect(metadata.encoding).toBe("base64");
        expect(metadata.width).toBe(64);
        expect(metadata.height).toBe(48);
        expect(metadata.hasExtractionHint).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createSteganographyPuzzle(knownSpec("stego-2"));

        expect(validateNormalizedTextAnswer(puzzle, " OPEN   LOCKER 7 ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "open locker 7")).toBe(false);
    });

    it("supports accepted alternatives", () => {
        const puzzle = createSteganographyPuzzle({
            ...knownSpec("stego-3"),
            intendedSolution: "door code 418",
            acceptedAlternatives: ["code 418"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "door code 418")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "code 418")).toBe(true);
    });

    it("creates a public projection without private metadata while retaining the image artifact", () => {
        const puzzle = createSteganographyPuzzle(knownSpec("stego-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).toContain("image/png");
        expect(serialized).not.toContain("OPEN LOCKER 7");
    });

    it("enforces recognition hint policy and leak checks", () => {
        expect(() => createSteganographyPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require an extraction hint");

        expect(() => createSteganographyPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            extractionHint: "Check the PNG least significant bits."
        })).toThrow("must not include an extraction hint");

        const explicit = createSteganographyPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            extractionHint: "Check the PNG least significant bits."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("extraction_hint");
        expect(explicit.prompt).toContain("least significant bits");

        expect(() => createSteganographyPuzzle({
            ...knownSpec("visible-leak"),
            coverTheme: "OPEN LOCKER 7 landscape"
        })).toThrow("must not appear in visible public text");
    });

    it("rejects invalid values and oversized payloads", () => {
        expect(() => normalizeSteganographyPayload("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeCoverTheme("   ")).toThrow("must not be empty");
        expect(() => normalizeSteganographyHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeSteganographyRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => createSteganographyPuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createSteganographyPuzzle({ ...knownSpec("bad-width"), width: 15 })).toThrow("width");
        expect(() => embedPngLsbRgb({ width: 16, height: 16, coverTheme: "tiny", payload: "X".repeat(200) })).toThrow("too large");
        expect(() => extractPngLsbRgbPayload(Buffer.from("not png").toString("base64"))).toThrow("Expected PNG data");
    });

    it("exports a local PNG preview file for demo viewing", async () => {
        const puzzle = createSteganographyPuzzle(knownSpec("stego-preview"));
        const preview = await writeSteganographyArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "steganography", "stego-preview.png"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            const bytes = await readFile(preview.path);
            expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        } finally {
            await rm(preview.path, { force: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createSteganographyPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "stego-tool-preview",
            intendedSolution: "OPEN LOCKER 7",
            coverTheme: "quiet landscape",
            recognitionLevel: "explicit",
            extractionHint: "Check the PNG RGB least significant bits.",
            width: 64,
            height: 48
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") throw new Error("Expected text tool content.");
        const payload = JSON.parse(textContent.text) as {
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            answer: string;
        };

        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "steganography", "stego-tool-preview.png"));
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("OPEN LOCKER 7");
            const pngData = (await readFile(payload.artifactPreviewPath)).toString("base64");
            expect(extractPngLsbRgbPayload(pngData)).toBe("OPEN LOCKER 7");
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});
