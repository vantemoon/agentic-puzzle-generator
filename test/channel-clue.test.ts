import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    createAlphaChannelPuzzle,
    extractAlphaChannelPayload,
    normalizeAlphaChannelPayload,
    normalizeAlphaChannelRecognitionLevel
} from "../src/agents/alpha-channel/engine.js";
import { createAlphaChannelPuzzleTool, writeAlphaChannelArtifactPreview } from "../src/agents/alpha-channel/tool.js";
import {
    createColorChannelPuzzle,
    extractColorChannelPayload,
    normalizeColorChannel,
    normalizeColorChannelPayload,
    normalizeColorChannelRecognitionLevel
} from "../src/agents/color-channel/engine.js";
import { createColorChannelPuzzleTool, writeColorChannelArtifactPreview } from "../src/agents/color-channel/tool.js";
import { assertPrivatePuzzleInstance, assertPublicPuzzleInstance, getPngImageData, toPublicPuzzle, validateNormalizedTextAnswer } from "../src/core/types.js";

const alphaSpec = (id: string) => ({
    id,
    intendedSolution: "MAP ROOM",
    coverTheme: "decorative museum map",
    recognitionLevel: "contextual" as const,
    width: 64,
    height: 48
});

const colorSpec = (id: string) => ({
    id,
    intendedSolution: "RED DOOR",
    coverTheme: "busy signal poster",
    channel: "red" as const,
    recognitionLevel: "contextual" as const,
    width: 64,
    height: 48
});

describe("alpha-channel puzzles", () => {
    it("creates deterministic PNG alpha-channel puzzles", () => {
        expect(normalizeAlphaChannelPayload(" MAP   ROOM ")).toBe("MAP ROOM");
        expect(normalizeAlphaChannelRecognitionLevel("hidden")).toBe("hidden");
        const first = createAlphaChannelPuzzle(alphaSpec("alpha-1"));
        const second = createAlphaChannelPuzzle(alphaSpec("alpha-1"));
        expect(first).toEqual(second);
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("alpha-channel");
        expect(first.artifact.kind).toBe("image");
        expect(first.artifact.mediaType).toBe("image/png");
        expect(extractAlphaChannelPayload(getPngImageData(first.artifact))).toBe("MAP ROOM");
        expect(validateNormalizedTextAnswer(first, " MAP   ROOM ")).toBe(true);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("enforces alpha-channel policies and public projection", () => {
        expect(() => createAlphaChannelPuzzle({ ...alphaSpec("explicit"), recognitionLevel: "explicit" })).toThrow("require an alpha inspection hint");
        expect(() => createAlphaChannelPuzzle({ ...alphaSpec("hidden"), recognitionLevel: "hidden", alphaInspectionHint: "Inspect alpha." })).toThrow("must not include");
        expect(() => createAlphaChannelPuzzle({ ...alphaSpec("leak"), coverTheme: "MAP ROOM poster" })).toThrow("must not appear");
        const puzzle = createAlphaChannelPuzzle(alphaSpec("alpha-public"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(JSON.stringify(publicPuzzle)).not.toContain("MAP ROOM");
    });

    it("exports alpha-channel demo previews and tool responses", async () => {
        const puzzle = createAlphaChannelPuzzle(alphaSpec("alpha-preview"));
        const preview = await writeAlphaChannelArtifactPreview(puzzle);
        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "alpha-channel", "alpha-preview.png"));
            expect((await readFile(preview.path)).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        } finally {
            await rm(preview.path, { force: true });
        }

        const result = await createAlphaChannelPuzzleTool.execute("tool", { mode: "demo", id: "alpha-tool", intendedSolution: "MAP ROOM", coverTheme: "decorative museum map", recognitionLevel: "explicit", alphaInspectionHint: "Inspect the PNG alpha channel.", width: 64, height: 48 });
        const text = result.content[0];
        if (text.type !== "text") throw new Error("Expected text content.");
        const payload = JSON.parse(text.text) as { artifactPreviewPath: string; answer: string };
        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "alpha-channel", "alpha-tool.png"));
            expect(payload.answer).toBe("MAP ROOM");
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});

describe("color-channel puzzles", () => {
    it("creates deterministic PNG color-channel puzzles", () => {
        expect(normalizeColorChannelPayload(" RED   DOOR ")).toBe("RED DOOR");
        expect(normalizeColorChannelRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeColorChannel("green")).toBe("green");
        const first = createColorChannelPuzzle(colorSpec("color-1"));
        const second = createColorChannelPuzzle(colorSpec("color-1"));
        expect(first).toEqual(second);
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("color-channel");
        expect(first.artifact.kind).toBe("image");
        expect(first.artifact.mediaType).toBe("image/png");
        expect(extractColorChannelPayload(getPngImageData(first.artifact), "red")).toBe("RED DOOR");
        expect(validateNormalizedTextAnswer(first, " RED   DOOR ")).toBe(true);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("enforces color-channel policies and public projection", () => {
        expect(() => normalizeColorChannel("alpha")).toThrow("color channel");
        expect(() => createColorChannelPuzzle({ ...colorSpec("explicit"), recognitionLevel: "explicit" })).toThrow("require a channel inspection hint");
        expect(() => createColorChannelPuzzle({ ...colorSpec("hidden"), recognitionLevel: "hidden", channelInspectionHint: "Inspect red." })).toThrow("must not include");
        expect(() => createColorChannelPuzzle({ ...colorSpec("leak"), coverTheme: "RED DOOR poster" })).toThrow("must not appear");
        const puzzle = createColorChannelPuzzle(colorSpec("color-public"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(JSON.stringify(publicPuzzle)).not.toContain("RED DOOR");
    });

    it("exports color-channel demo previews and tool responses", async () => {
        const puzzle = createColorChannelPuzzle(colorSpec("color-preview"));
        const preview = await writeColorChannelArtifactPreview(puzzle);
        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "color-channel", "color-preview.png"));
            expect((await readFile(preview.path)).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        } finally {
            await rm(preview.path, { force: true });
        }

        const result = await createColorChannelPuzzleTool.execute("tool", { mode: "demo", id: "color-tool", intendedSolution: "RED DOOR", coverTheme: "busy signal poster", channel: "red", recognitionLevel: "explicit", channelInspectionHint: "Inspect the red channel.", width: 64, height: 48 });
        const text = result.content[0];
        if (text.type !== "text") throw new Error("Expected text content.");
        const payload = JSON.parse(text.text) as { artifactPreviewPath: string; answer: string };
        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "color-channel", "color-tool.png"));
            expect(payload.answer).toBe("RED DOOR");
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});
