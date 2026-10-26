import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writePngImageArtifactPreview } from "../src/core/image-preview.js";
import {
    assertPrivatePuzzleInstance,
    createPngImageArtifact,
    getPngImageData,
    getPuzzleArtifactSource,
    type PrivatePuzzleInstance
} from "../src/core/types.js";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function pngPuzzle(id: string): PrivatePuzzleInstance {
    return {
        id,
        puzzleType: "hidden-information",
        subtype: "png-artifact-fixture",
        inputs: [],
        outputs: [{ key: "answer", valueType: "plain-text", description: "Fixture answer.", value: "OK" }],
        artifact: createPngImageArtifact(ONE_PIXEL_PNG_BASE64),
        prompt: "Inspect the PNG artifact.",
        solution: { valueType: "text", canonical: "OK", normalization: ["trim"] },
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: false, collapseWhitespace: false } },
        externalKnowledge: { required: false },
        extensions: {}
    };
}

describe("PNG image artifacts", () => {
    it("creates and validates base64 PNG image artifacts", () => {
        const artifact = createPngImageArtifact(ONE_PIXEL_PNG_BASE64);

        expect(artifact.kind).toBe("image");
        expect(artifact.mediaType).toBe("image/png");
        expect(artifact.encoding).toBe("base64");
        expect(getPngImageData(artifact)).toBe(ONE_PIXEL_PNG_BASE64);
        expect(getPuzzleArtifactSource(artifact)).toBe(ONE_PIXEL_PNG_BASE64);
    });

    it("rejects non-PNG or non-raw base64 data", () => {
        expect(() => createPngImageArtifact("not-base64")).toThrow("base64");
        expect(() => createPngImageArtifact(Buffer.from("hello").toString("base64"))).toThrow("PNG data");
        expect(() => createPngImageArtifact(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`)).toThrow("data URLs");
    });

    it("supports private puzzle validation and PNG preview export", async () => {
        const puzzle = pngPuzzle("png-preview-fixture");
        expect(() => assertPrivatePuzzleInstance(puzzle)).not.toThrow();

        const preview = await writePngImageArtifactPreview({
            puzzle,
            artifactDirectoryName: "png-fixture",
            fallbackFileStem: "png-preview"
        });

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "png-fixture", "png-preview-fixture.png"));
            const bytes = await readFile(preview.path);
            expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        } finally {
            await rm(preview.path, { force: true });
        }
    });
});
