import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertImageContextConsistency,
    assertSafeStaticHtml,
    createAltTextPuzzle,
    extractAltTextPayloads,
    normalizeAltInspectionHint,
    normalizeAltTextPayload,
    normalizeImageCaption,
    normalizeImageLabel,
    normalizeRecognitionLevel,
    normalizeVisibleBody,
    normalizeVisibleTitle
} from "../src/agents/alt-text/engine.js";
import {
    createAltTextPuzzleTool,
    writeAltTextArtifactPreview
} from "../src/agents/alt-text/tool.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getHtmlEntrySource,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "DEPLOY-742",
    visibleTitle: "Gallery Review",
    visibleBody: "One diagram looks ordinary in the release gallery.",
    imageLabel: "System Diagram",
    recognitionLevel: "contextual" as const
});

function removeMarkedAltImage(source: string): string {
    return source.replace(
        /<img\b(?=[^>]*data-puzzle-role="alt-text-payload")[^>]*>/gi,
        ""
    );
}

describe("alt-text engine", () => {
    it("normalizes documented fields and recognition levels", () => {
        expect(normalizeAltTextPayload("  DEPLOY   742  ")).toBe("DEPLOY 742");
        expect(normalizeVisibleTitle("  Gallery   Review  ")).toBe("Gallery Review");
        expect(normalizeVisibleBody("  Ordinary   diagram  ")).toBe("Ordinary diagram");
        expect(normalizeImageLabel("  System   Diagram  ")).toBe("System Diagram");
        expect(normalizeAltInspectionHint("  Read   the image description  "))
            .toBe("Read the image description");
        expect(normalizeAltInspectionHint(undefined)).toBeUndefined();
        expect(normalizeImageCaption("  Figure   one  ")).toBe("Figure one");
        expect(normalizeImageCaption(undefined)).toBeUndefined();
        expect(normalizeRecognitionLevel("hidden")).toBe("hidden");
    });

    it("creates a deterministic private instance with a safe self-contained HTML image artifact", () => {
        const first = createAltTextPuzzle(knownSpec("alt-text-1"));
        const second = createAltTextPuzzle(knownSpec("alt-text-1"));
        const metadata = first.extensions.altText as {
            templateVersion: string;
            payloadRole: string;
            recognitionLevel: string;
            hasAltInspectionHint: boolean;
            hasImageCaption: boolean;
            imageSourceKind: string;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("alt-text-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("alt-text");
        expect(first.artifact.kind).toBe("html");
        expect(first.artifact.mediaType).toBe("text/html");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["visible_page_text", "image_alt_payload"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["html-visible-text", "image-alt-text"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(extractAltTextPayloads(getHtmlEntrySource(first.artifact))).toEqual(["DEPLOY-742"]);
        expect(getHtmlEntrySource(first.artifact)).toContain('data-puzzle-role="alt-text-payload"');
        expect(getHtmlEntrySource(first.artifact)).toContain('src="data:image/svg+xml;utf8,');
        expect(getHtmlEntrySource(first.artifact)).toContain('alt="DEPLOY-742"');
        expect(first.prompt).toBe("Open the webpage artifact and recover the image alt-text message.");
        expect(metadata.templateVersion).toBe("safe-static-alt-text-v1");
        expect(metadata.payloadRole).toBe("alt-text-payload");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.hasAltInspectionHint).toBe(false);
        expect(metadata.hasImageCaption).toBe(false);
        expect(metadata.imageSourceKind).toBe("inline-svg-data-url");
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertSafeStaticHtml(getHtmlEntrySource(first.artifact))).not.toThrow();
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("HTML-escapes visible text, SVG label text, captions, hints, and alt payloads", () => {
        const puzzle = createAltTextPuzzle({
            id: "alt-text-escape",
            intendedSolution: "KEEP <CASE> & go",
            visibleTitle: "Gallery <Review>",
            visibleBody: "Check the system diagram & B before 'launch' and \"handoff\".",
            imageLabel: "System <Diagram>",
            recognitionLevel: "explicit",
            altInspectionHint: "Read the image's \"description\" & metadata.",
            imageCaption: "Figure <one> & notes"
        });

        expect(getHtmlEntrySource(puzzle.artifact)).toContain("<title>Gallery &lt;Review&gt;</title>");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('Check the system diagram &amp; B before &#39;launch&#39; and &quot;handoff&quot;.');
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Read the image&#39;s &quot;description&quot; &amp; metadata.");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Figure &lt;one&gt; &amp; notes");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('alt="KEEP &lt;CASE&gt; &amp; go"');
        expect(decodeURIComponent(getHtmlEntrySource(puzzle.artifact))).toContain("System &lt;Diagram&gt;");
        expect(extractAltTextPayloads(getHtmlEntrySource(puzzle.artifact))).toEqual(["KEEP <CASE> & go"]);
        expect(removeMarkedAltImage(getHtmlEntrySource(puzzle.artifact))).not.toContain("KEEP <CASE> & go");
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createAltTextPuzzle(knownSpec("alt-text-2"));

        expect(validateNormalizedTextAnswer(puzzle, " DEPLOY-742 ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "deploy-742")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "DEPLOY 742")).toBe(false);
    });

    it("supports intentional accepted alternatives", () => {
        const puzzle = createAltTextPuzzle({
            ...knownSpec("alt-text-3"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-17")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the public alt attribute", () => {
        const puzzle = createAltTextPuzzle(knownSpec("alt-text-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain('data-puzzle-role="alt-text-payload"');
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain('alt="DEPLOY-742"');
        expect(removeMarkedAltImage(getHtmlEntrySource(publicPuzzle.artifact))).not.toContain("DEPLOY-742");
    });

    it("enforces recognition-level hint policy", () => {
        expect(() => createAltTextPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require an alt-text inspection hint");

        expect(() => createAltTextPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            altInspectionHint: "Read the image description."
        })).toThrow("must not include an alt-text inspection hint");

        const explicit = createAltTextPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            altInspectionHint: "Read the image description."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("alt_inspection_hint");
        expect(getHtmlEntrySource(explicit.artifact)).toContain("Read the image description");

        const hidden = createAltTextPuzzle({
            ...knownSpec("hidden-no-hint"),
            recognitionLevel: "hidden"
        });
        expect(hidden.inputs.map((port) => port.key)).not.toContain("alt_inspection_hint");
    });

    it("rejects invalid values", () => {
        expect(() => normalizeAltTextPayload("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeVisibleTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeVisibleBody("B".repeat(1_001))).toThrow("must not exceed 1000");
        expect(() => normalizeImageLabel("L".repeat(121))).toThrow("must not exceed 120");
        expect(() => normalizeAltInspectionHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeImageCaption("C".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => assertImageContextConsistency({
            visibleTitle: "Release Notes",
            visibleBody: "The page discusses deployment status.",
            imageLabel: "Garden Map"
        })).toThrow("share at least one meaningful word");
        expect(() => createAltTextPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
        expect(() => createAltTextPuzzle({
            ...knownSpec("visible-leak"),
            visibleBody: "The answer is DEPLOY-742."
        })).toThrow("must not appear in visible page or image text");
        expect(() => createAltTextPuzzle({
            ...knownSpec("image-label-leak"),
            imageLabel: "DEPLOY-742"
        })).toThrow("must not appear in visible page or image text");
    });

    it("rejects unsafe static HTML patterns", () => {
        expect(() => assertSafeStaticHtml("<script>alert(1)</script>"))
            .toThrow("static");
        expect(() => assertSafeStaticHtml("<p onclick=\"x()\">Hello</p>"))
            .toThrow("event-handler");
        expect(() => assertSafeStaticHtml("<a href=\"javascript:alert(1)\">x</a>"))
            .toThrow("javascript");
        expect(() => assertSafeStaticHtml("<img src=\"https://example.test/a.png\">"))
            .toThrow("remote resources");
        expect(() => assertSafeStaticHtml("<iframe srcdoc=\"x\"></iframe>"))
            .toThrow("static");
    });

    it("exports a local HTML preview file for demo viewing", async () => {
        const puzzle = createAltTextPuzzle(knownSpec("alt-text-preview"));
        const preview = await writeAltTextArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "alt-text", "alt-text-preview", "index.html"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getHtmlEntrySource(puzzle.artifact));
        } finally {
            await rm(path.dirname(preview.path), { force: true, recursive: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createAltTextPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "alt-text-tool-preview",
            intendedSolution: "DEPLOY-742",
            visibleTitle: "Gallery Review",
            visibleBody: "One diagram looks ordinary in the release gallery.",
            imageLabel: "System Diagram",
            recognitionLevel: "contextual"
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") {
            throw new Error("Expected text tool content.");
        }
        const payload = JSON.parse(textContent.text) as {
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            answer: string;
        };

        try {
            expect(payload.artifactPreviewPath).toBe(
                path.join("generated-artifacts", "alt-text", "alt-text-tool-preview", "index.html")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("DEPLOY-742");
            await expect(readFile(payload.artifactPreviewPath, "utf8"))
                .resolves.toContain('alt="DEPLOY-742"');
        } finally {
            await rm(path.dirname(payload.artifactPreviewPath), { force: true, recursive: true });
        }
    });
});
