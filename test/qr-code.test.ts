import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    buildQrCodeSvg,
    createQrCodeMatrix,
    createQrCodePuzzle,
    extractQrCodePayload,
    normalizeQrCodePayload,
    normalizeQrCodePayloadKind,
} from "../src/features/puzzle-generation/generators/qr-code/engine.js";
import { createQrCodePuzzleTool, writeQrCodeArtifactPreview } from "../src/features/puzzle-generation/generators/qr-code/tool.js";
import { assertPrivatePuzzleInstance, assertPublicPuzzleInstance, getSvgImageSource, toPublicPuzzle, validateNormalizedTextAnswer } from "../src/shared/artifacts/types.js";

const spec = (id: string) => ({
    id,
    intendedSolution: "CASE-417",
    payloadKind: "identifier" as const,
    documentTheme: "scanned investigation poster",
    moduleSize: 6
});

describe("qr-code engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizeQrCodePayload(" CASE-417 ")).toBe("CASE-417");
        expect(normalizeQrCodePayloadKind("url")).toBe("url");

    });

    it("builds a deterministic QR matrix that round trips its payload", () => {
        const first = createQrCodeMatrix("CASE-417");
        const second = createQrCodeMatrix("CASE-417");

        expect(first).toEqual(second);
        expect(first.size).toBe(21);
        expect(first.dataCodewords).toHaveLength(19);
        expect(first.errorCorrectionCodewords).toHaveLength(7);
        expect(extractQrCodePayload(first)).toBe("CASE-417");
        expect(first.modules[0][0]).toBe(true);
        expect(first.modules[6][6]).toBe(true);
    });

    it("creates deterministic SVG QR-code puzzles", () => {
        const first = createQrCodePuzzle(spec("qr-1"));
        const second = createQrCodePuzzle(spec("qr-1"));
        const metadata = first.extensions.qrCode as {
            templateVersion: string;
            qrVersion: number;
            errorCorrectionLevel: string;
            maskPattern: number;
            payloadKind: string;
            mediaType: string;
            moduleSize: number;
            matrixSize: number;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.puzzleType).toBe("encoding");
        expect(first.subtype).toBe("qr-code");
        expect(first.artifact.kind).toBe("image");
        expect(first.artifact.mediaType).toBe("image/svg+xml");
        expect(getSvgImageSource(first.artifact)).toContain("<svg");
        expect(getSvgImageSource(first.artifact)).toContain("aria-label=\"QR code\"");
        expect(metadata.templateVersion).toBe("qr-code-svg-v1");
        expect(metadata.qrVersion).toBe(1);
        expect(metadata.errorCorrectionLevel).toBe("L");
        expect(metadata.maskPattern).toBe(0);
        expect(metadata.payloadKind).toBe("identifier");
        expect(metadata.mediaType).toBe("image/svg+xml");
        expect(metadata.moduleSize).toBe(6);
        expect(metadata.matrixSize).toBe(21);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(validateNormalizedTextAnswer(first, " CASE-417 ")).toBe(true);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses version 2-L for longer payloads and preserves the full decoded address", () => {
        const address = "18 Mason Street, Unit 3";
        const matrix = createQrCodeMatrix(address);
        expect(matrix).toMatchObject({ version: 2, size: 25 });
        expect(matrix.dataCodewords).toHaveLength(34);
        expect(matrix.errorCorrectionCodewords).toHaveLength(10);
        expect(matrix.reserved[18][18]).toBe(true);
        expect(extractQrCodePayload(matrix)).toBe(address);
        expect(createQrCodeMatrix("X".repeat(17)).version).toBe(1);
        expect(extractQrCodePayload(createQrCodeMatrix("X".repeat(32)))).toBe("X".repeat(32));
    });

    it("builds SVG directly from payload", () => {
        const svg = buildQrCodeSvg("HELLO", 4);
        expect(svg).toContain("width=\"116\"");
        expect(svg).toContain("height=\"116\"");
        expect(svg).toContain("<rect");
        expect(svg).not.toContain("<script");
    });

    it("supports alternatives and public projection", () => {
        const puzzle = createQrCodePuzzle({ ...spec("qr-alt"), intendedSolution: "A1", acceptedAlternatives: ["ALT"] });
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(validateNormalizedTextAnswer(puzzle, "ALT")).toBe(true);
        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("A1");
    });

    it("enforces payload capacity, leak checks, and module size", () => {
        expect(() => normalizeQrCodePayload("X".repeat(33))).toThrow("must not exceed 32");
        expect(() => normalizeQrCodePayloadKind("barcode")).toThrow("payload kind");


        expect(() => createQrCodePuzzle({ ...spec("leak"), documentTheme: "CASE-417 poster" })).toThrow("must not appear");
        expect(() => createQrCodePuzzle({ ...spec("bad-module"), moduleSize: 3 })).toThrow("module size");
    });

    it("exports local SVG previews and demo tool responses", async () => {
        const puzzle = createQrCodePuzzle(spec("qr-preview"));
        const preview = await writeQrCodeArtifactPreview(puzzle);
        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "qr-code", "qr-preview.svg"));
            expect((await readFile(preview.path, "utf8"))).toContain("<svg");
        } finally {
            await rm(preview.path, { force: true });
        }

        const result = await createQrCodePuzzleTool.execute("tool", { mode: "demo", id: "qr-tool", intendedSolution: "CASE-417", payloadKind: "identifier", documentTheme: "scanned investigation poster", moduleSize: 6 });
        const text = result.content[0];
        if (text.type !== "text") throw new Error("Expected text content.");
        const payload = JSON.parse(text.text) as { artifactPreviewPath: string; answer: string };
        try {
            expect(payload.artifactPreviewPath).toBe(path.join("generated-artifacts", "qr-code", "qr-tool.svg"));
            expect(payload.answer).toBe("CASE-417");
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });
});
