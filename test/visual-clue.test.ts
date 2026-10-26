import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertClueLabelIsVisible,
    assertClueLabelIsHidden,
    assertSafeStaticSvg,
    buildVisualClueSvg,
    compileDrawingInstructions,
    createVisualCluePuzzle,
    extractVisualCluePayloads,
    normalizeSceneTheme,
    normalizeSceneTitle,
    normalizeVisualClueKind,
    normalizeVisualClueSolution
} from "../src/agents/visual-clue/engine.js";
import {
    createVisualCluePuzzleTool,
    writeVisualClueArtifactPreview
} from "../src/agents/visual-clue/tool.js";
import { VISUAL_CLUE_MAX_OUTPUT_TOKENS } from "../src/agents/visual-clue/agent.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getSvgImageSource,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const ARCHIVE_BACKGROUND_ELEMENTS = [
    "rect|0|0|420|220|#d8cfba|none|0|1|0|0",
    "rect|22|24|120|172|#65594b|#4f4638|2|1|3|3",
    "rect|278|24|120|172|#65594b|#4f4638|2|1|3|3",
    "path|M22 70H142M22 116H142M278 70H398M278 116H398|none|#b59b75|5|1",
    "rect|166|128|88|48|#8b6f4f|#4f4638|1|1|2|2"
];
const ARCHIVE_CLUE_ELEMENTS = [
    "path|M108 83L117 86L113 91L106 88Z|#d8b75f|#4f4638|1|1",
    "circle|109|86|1.3|#f5e4a6|none|0|1",
    "text|108|104|6|#4f4638|middle|serif|STAR"
];

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "STAR",
    sceneTitle: "Archive Room",
    sceneTheme: "dusty archive room with shelves and labels",
    sceneDescription: "The office scene looks ordinary, with shelves, furniture, and a few background details.",
    backgroundElements: ARCHIVE_BACKGROUND_ELEMENTS,
    clueElements: ARCHIVE_CLUE_ELEMENTS,
    showClueLabel: true,
    clueKind: "symbol" as const,
    clueLabel: "STAR",
    imageCaption: "An illustrated archive room."
});

function getSvgArtifactSource(puzzle: ReturnType<typeof createVisualCluePuzzle>): string {
    return getSvgImageSource(puzzle.artifact);
}

describe("visual-clue engine", () => {
    it("allows enough model output for detailed drawing plans", () => {
        expect(VISUAL_CLUE_MAX_OUTPUT_TOKENS).toBe(16_000);
    });

    it("requires LLM-authored artwork in the creation tool call", () => {
        const schema = createVisualCluePuzzleTool.parameters as { required?: string[] };
        expect(schema.required).toEqual(expect.arrayContaining(["backgroundElements", "clueElements", "showClueLabel"]));
    });

    it("normalizes documented fields", () => {
        expect(normalizeVisualClueSolution("  BLUE   PIN  ")).toBe("BLUE PIN");
        expect(normalizeSceneTitle("  Archive   Room  ")).toBe("Archive Room");
        expect(normalizeSceneTheme("  dusty   archive room  ")).toBe("dusty archive room");



        expect(normalizeVisualClueKind("pattern")).toBe("pattern");
    });

    it("creates a deterministic private instance with a safe SVG artifact", () => {
        const first = createVisualCluePuzzle(knownSpec("visual-clue-1"));
        const second = createVisualCluePuzzle(knownSpec("visual-clue-1"));
        const metadata = first.extensions.visualClue as {
            templateVersion: string;
            clueKind: string;
            sceneTheme: string;
            backgroundRenderer: string;
            clueRenderer: string;
            showClueLabel: boolean;
            imageFormat: string;
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
        expect(metadata.templateVersion).toBe("llm-drawing-visual-clue-v4");
        expect(metadata.clueKind).toBe("symbol");
        expect(metadata.backgroundRenderer).toBe("llm-authored-drawing-plan");
        expect(metadata.clueRenderer).toBe("llm-authored-drawing-plan");
        expect(metadata.showClueLabel).toBe(true);
        expect(metadata.sceneTheme).toBe("dusty archive room with shelves and labels");
        expect(metadata.imageFormat).toBe("svg");
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
                clueElements: clueKind === "text"
                    ? ARCHIVE_CLUE_ELEMENTS.map((element) => element.replace("STAR", "ROOM 12"))
                    : ARCHIVE_CLUE_ELEMENTS,
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
            clueElements: ARCHIVE_CLUE_ELEMENTS.map((element) => element.replace("STAR", "blue pin")),
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

    it("rejects visible solution leaks", () => {

        expect(() => createVisualCluePuzzle({
            ...knownSpec("visible-leak"),
            sceneDescription: "The answer is STAR."
        })).toThrow("must not appear in visible non-clue text");
    });

    it("rejects invalid values and unsafe SVG patterns", () => {
        expect(() => normalizeVisualClueSolution("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeSceneTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeVisualClueKind("photo")).toThrow("clue kind");
        expect(() => compileDrawingInstructions(["script|alert(1)"], "background", 250)).toThrow("Unsupported");
        expect(() => compileDrawingInstructions(["rect|0|0"], "background", 250)).toThrow("requires");
        expect(() => compileDrawingInstructions(["path|not valid|none|#000|1|1"], "background", 250)).toThrow("path data");
        expect(() => assertClueLabelIsVisible('<circle cx="10" cy="10" r="3"/>', "STAR")).toThrow("exact clue label");
        expect(() => assertClueLabelIsHidden('<text x="10" y="10">STAR</text>', "STAR")).toThrow("omit");
        expect(() => createVisualCluePuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createVisualCluePuzzle({
            ...knownSpec("label-mismatch"),
            clueLabel: "MOON"
        })).toThrow("clue label must match");
        expect(() => assertSafeStaticSvg("<svg><script>alert(1)</script></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><image href=\"x.png\" /></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><a href=\"/x\"><circle /></a></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><text onclick=\"x()\">Hello</text></svg>")).toThrow("event-handler");
        expect(() => assertSafeStaticSvg("<svg><rect style=\"fill:red\"/></svg>")).toThrow("style attributes");
        expect(() => assertSafeStaticSvg("<svg><style>@import 'x.css'</style></svg>")).toThrow("static");
        expect(() => assertSafeStaticSvg("<svg><animate attributeName=\"x\" /></svg>")).toThrow("static");
        expect(() => createVisualCluePuzzle({
            ...knownSpec("background-leak"),
            backgroundElements: [...ARCHIVE_BACKGROUND_ELEMENTS, "text|200|20|8|#000|middle|serif|STAR"]
        })).toThrow("background SVG");
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
            backgroundElements: ARCHIVE_BACKGROUND_ELEMENTS,
            clueElements: ARCHIVE_CLUE_ELEMENTS,
            showClueLabel: true,
            clueKind: "symbol",
            clueLabel: "STAR",});
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
        const svg = buildVisualClueSvg({ sceneTitle: "Room", sceneTheme: "quiet study with desk objects", sceneDescription: "A quiet room.", backgroundElements: ARCHIVE_BACKGROUND_ELEMENTS, clueElements: ARCHIVE_CLUE_ELEMENTS.map((element) => element.replace("STAR", "PIN")), clueKind: "object", clueLabel: "PIN" });
        expect(svg).toContain("<svg");
        expect(svg).toContain("#d8cfba");
        expect(svg).toContain("M108 83L117 86");
        expect(svg).not.toContain("data:image/png");
        expect(svg).not.toContain("data:image/jpeg");
    });

    it("uses LLM-authored clue artwork instead of a fixed icon", () => {
        const first = createVisualCluePuzzle(knownSpec("contextual-clue-one"));
        const second = createVisualCluePuzzle({
            ...knownSpec("contextual-clue-two"),
            clueElements: [
                "path|M310 48L318 62H302Z|#6e8771|#425446|1|1",
                "text|310|72|7|#425446|middle|serif|STAR"
            ]
        });

        expect(getSvgArtifactSource(first)).toContain("M108 83L117 86");
        expect(getSvgArtifactSource(second)).toContain("M310 48L318 62H302Z");
        expect(extractVisualCluePayloads(getSvgArtifactSource(second))).toEqual(["STAR"]);
    });

    it("allows a distinctive visual clue to omit its visible answer label", () => {
        const lighthouse = createVisualCluePuzzle({
            ...knownSpec("unlabelled-lighthouse"),
            intendedSolution: "lighthouse",
            clueLabel: "lighthouse",
            showClueLabel: false,
            clueElements: [
                "path|M350 180L370 180L366 70L354 70Z|#d9d2bd|#263544|2|1",
                "circle|360|60|9|#f4d47c|#263544|2|1",
                "polygon|360,45 350,70 370,70|#596b7d|#263544|2|1"
            ]
        });
        const svg = getSvgArtifactSource(lighthouse);

        expect(svg).not.toMatch(/<text\b[^>]*>lighthouse<\/text>/);
        expect(extractVisualCluePayloads(svg)).toEqual(["lighthouse"]);
    });
});
