import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertSafeStaticSvg,
    buildVisualClueSvg,
    createVisualCluePuzzle,
    extractVisualCluePayloads,
    normalizeObservationHint,
    normalizeSceneTheme,
    normalizeSceneTitle,
    normalizeVisualClueKind,
    normalizeVisualClueRecognitionLevel,
    normalizeVisualClueSolution
} from "../src/agents/visual-clue/engine.js";
import {
    createVisualCluePuzzleTool,
    writeVisualClueArtifactPreview
} from "../src/agents/visual-clue/tool.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getSvgImageSource,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "STAR",
    sceneTitle: "Archive Room",
    sceneTheme: "dusty archive room with shelves and labels",
    sceneDescription: "The office scene looks ordinary, with shelves, furniture, and a few background details.",
    clueKind: "symbol" as const,
    clueLabel: "STAR",
    recognitionLevel: "contextual" as const,
    imageCaption: "An illustrated archive room."
});

function getSvgArtifactSource(puzzle: ReturnType<typeof createVisualCluePuzzle>): string {
    return getSvgImageSource(puzzle.artifact);
}

describe("visual-clue engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizeVisualClueSolution("  BLUE   PIN  ")).toBe("BLUE PIN");
        expect(normalizeSceneTitle("  Archive   Room  ")).toBe("Archive Room");
        expect(normalizeSceneTheme("  dusty   archive room  ")).toBe("dusty archive room");
        expect(normalizeObservationHint("  Inspect   the image  ")).toBe("Inspect the image");
        expect(normalizeObservationHint(undefined)).toBeUndefined();
        expect(normalizeVisualClueRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeVisualClueKind("pattern")).toBe("pattern");
    });

    it("creates a deterministic private instance with a safe SVG artifact", () => {
        const first = createVisualCluePuzzle(knownSpec("visual-clue-1"));
        const second = createVisualCluePuzzle(knownSpec("visual-clue-1"));
        const metadata = first.extensions.visualClue as {
            templateVersion: string;
            recognitionLevel: string;
            clueKind: string;
            sceneTheme: string;
            imageFormat: string;
            hasObservationHint: boolean;
            hasImageCaption: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("visual-clue-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("visual-clue");
        expect(first.artifact.kind).toBe("image");
        expect(first.artifact.mediaType).toBe("image/svg+xml");
        const svg = getSvgArtifactSource(first);
        expect(svg).toContain("<svg");
        expect(svg).toContain('data-puzzle-role="visual-clue-payload"');
        expect(extractVisualCluePayloads(svg)).toEqual(["STAR"]);
        expect(metadata.templateVersion).toBe("safe-static-visual-clue-v1");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.clueKind).toBe("symbol");
        expect(metadata.sceneTheme).toBe("dusty archive room with shelves and labels");
        expect(metadata.imageFormat).toBe("svg");
        expect(metadata.hasObservationHint).toBe(false);
        expect(metadata.hasImageCaption).toBe(true);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertSafeStaticSvg(svg)).not.toThrow();
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("supports all visual clue kinds in SVG", () => {
        for (const clueKind of ["object", "symbol", "text", "pattern", "contradiction"] as const) {
            const puzzle = createVisualCluePuzzle({
                ...knownSpec(`visual-clue-${clueKind}`),
                intendedSolution: clueKind === "text" ? "ROOM 12" : "STAR",
                clueLabel: clueKind === "text" ? "ROOM 12" : "STAR",
                clueKind
            });
            expect(extractVisualCluePayloads(getSvgArtifactSource(puzzle)))
                .toEqual([clueKind === "text" ? "ROOM 12" : "STAR"]);
        }
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createVisualCluePuzzle(knownSpec("visual-clue-2"));

        expect(validateNormalizedTextAnswer(puzzle, " STAR ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "star")).toBe(false);
    });

    it("supports intentional accepted alternatives", () => {
        const puzzle = createVisualCluePuzzle({
            ...knownSpec("visual-clue-3"),
            intendedSolution: "blue pin",
            clueLabel: "blue pin",
            clueKind: "object",
            acceptedAlternatives: ["small blue pin"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "blue pin")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "small blue pin")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "BLUE PIN")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the SVG artifact", () => {
        const puzzle = createVisualCluePuzzle(knownSpec("visual-clue-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).toContain("image/svg+xml");
        expect(serialized).toContain("STAR");
    });

    it("enforces recognition hint policy and leak checks", () => {
        expect(() => createVisualCluePuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require an observation hint");

        expect(() => createVisualCluePuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            observationHint: "Inspect the image carefully."
        })).toThrow("must not include an observation hint");

        const explicit = createVisualCluePuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            observationHint: "Inspect the image carefully."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("observation_hint");
        expect(getSvgArtifactSource(explicit)).toContain("Inspect the image carefully");

        expect(() => createVisualCluePuzzle({
            ...knownSpec("visible-leak"),
            sceneDescription: "The answer is STAR."
        })).toThrow("must not appear in visible non-clue text");
    });

    it("rejects invalid values and unsafe SVG patterns", () => {
        expect(() => normalizeVisualClueSolution("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeSceneTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeObservationHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeVisualClueRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => normalizeVisualClueKind("photo")).toThrow("clue kind");
        expect(() => createVisualCluePuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createVisualCluePuzzle({
            ...knownSpec("label-mismatch"),
            clueLabel: "MOON"
        })).toThrow("clue label must match");
        expect(() => assertSafeStaticSvg("<svg><script>alert(1)</script></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><image href=\"x.png\" /></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><a href=\"/x\"><circle /></a></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><text onclick=\"x()\">Hello</text></svg>")).toThrow("event-handler");
    });

    it("exports a local SVG preview file for demo viewing", async () => {
        const puzzle = createVisualCluePuzzle(knownSpec("visual-clue-preview"));
        const preview = await writeVisualClueArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "visual-clue", "visual-clue-preview.svg"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getSvgArtifactSource(puzzle));
        } finally {
            await rm(preview.path, { force: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createVisualCluePuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "visual-clue-tool-preview",
            intendedSolution: "STAR",
            sceneTitle: "Archive Room",
            sceneTheme: "dusty archive room with shelves and labels",
            sceneDescription: "The office scene looks ordinary, with shelves and a few background details.",
            clueKind: "symbol",
            clueLabel: "STAR",
            recognitionLevel: "contextual"
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") throw new Error("Expected text tool content.");
        const payload = JSON.parse(textContent.text) as {
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            artifactPreviewDirectory?: string;
            answer: string;
        };

        try {
            expect(payload.artifactPreviewPath).toBe(
                path.join("generated-artifacts", "visual-clue", "visual-clue-tool-preview.svg")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.artifactPreviewDirectory).toBeUndefined();
            expect(payload.answer).toBe("STAR");
            await expect(readFile(payload.artifactPreviewPath, "utf8")).resolves.toContain("STAR");
        } finally {
            await rm(payload.artifactPreviewPath, { force: true });
        }
    });

    it("builds only SVG image content, not raster data", () => {
        const svg = buildVisualClueSvg({ sceneTitle: "Room", sceneTheme: "quiet study with desk objects", sceneDescription: "A quiet room.", clueKind: "object", clueLabel: "PIN" });
        expect(svg).toContain("<svg");
        expect(svg).not.toContain("data:image/png");
        expect(svg).not.toContain("data:image/jpeg");
    });
});
