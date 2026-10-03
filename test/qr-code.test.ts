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
    normalizeQrCodeRecognitionLevel
} from "../src/agents/qr-code/engine.js";
import { createQrCodePuzzleTool, writeQrCodeArtifactPreview } from "../src/agents/qr-code/tool.js";
import { assertPrivatePuzzleInstance, assertPublicPuzzleInstance, getSvgImageSource, toPublicPuzzle, validateNormalizedTextAnswer } from "../src/core/types.js";

const spec = (id: string) => ({
    id,
    intendedSolution: "CASE-417",
    payloadKind: "identifier" as const,
    documentTheme: "scanned investigation poster",
    recognitionLevel: "contextual" as const,
    moduleSize: 6
});

describe("qr-code engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizeQrCodePayload(" CASE-417 ")).toBe("CASE-417");
        expect(normalizeQrCodePayloadKind("url")).toBe("url");
        expect(normalizeQrCodeRecognitionLevel("hidden")).toBe("hidden");
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
            recognitionLevel: string;
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
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.mediaType).toBe("image/svg+xml");
        expect(metadata.moduleSize).toBe(6);
        expect(metadata.matrixSize).toBe(21);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(validateNormalizedTextAnswer(first, " CASE-417 ")).toBe(true);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
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

    it("enforces payload capacity, hint policy, leak checks, and module size", () => {
        expect(() => normalizeQrCodePayload("X".repeat(18))).toThrow("must not exceed 17");
        expect(() => normalizeQrCodePayloadKind("barcode")).toThrow("payload kind");
        expect(() => createQrCodePuzzle({ ...spec("explicit"), recognitionLevel: "explicit" })).toThrow("require a scan hint");
        expect(() => createQrCodePuzzle({ ...spec("hidden"), recognitionLevel: "hidden", scanHint: "Scan it." })).toThrow("must not include");
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

        const result = await createQrCodePuzzleTool.execute("tool", { mode: "demo", id: "qr-tool", intendedSolution: "CASE-417", payloadKind: "identifier", documentTheme: "scanned investigation poster", recognitionLevel: "explicit", scanHint: "Scan the QR code.", moduleSize: 6 });
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
