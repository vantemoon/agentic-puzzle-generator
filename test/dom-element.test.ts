import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertSafeStaticHtml,
    createDomElementPuzzle,
    extractHiddenDomPayloads,
    normalizeDomElementPayload,
    normalizeDomInspectionHint,
    normalizeElementTag,
    normalizeHideStrategy,
    normalizeRecognitionLevel,
    normalizeVisibleBody,
    normalizeVisibleTitle
} from "../src/agents/dom-element/engine.js";
import {
    createDomElementPuzzleTool,
    writeDomElementArtifactPreview
} from "../src/agents/dom-element/tool.js";
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
    visibleTitle: "Release Dashboard",
    visibleBody: "The page looks complete, but the staging checklist says one DOM node was left behind.",
    recognitionLevel: "contextual" as const,
    hideStrategy: "display-none" as const
});

function removeMarkedHiddenPayload(source: string): string {
    return source.replace(
        /<(p|span|div)\b(?=[^>]*data-puzzle-role="hidden-payload")[^>]*>[\s\S]*?<\/\1>/gi,
        ""
    );
}

describe("hidden DOM element engine", () => {
    it("normalizes documented fields, recognition levels, strategies, and tags", () => {
        expect(normalizeDomElementPayload("  DEPLOY   742  ")).toBe("DEPLOY 742");
        expect(normalizeVisibleTitle("  Release   Dashboard  ")).toBe("Release Dashboard");
        expect(normalizeVisibleBody("  Staging   page  ")).toBe("Staging page");
        expect(normalizeDomInspectionHint("  Inspect   the structure  "))
            .toBe("Inspect the structure");
        expect(normalizeDomInspectionHint(undefined)).toBeUndefined();
        expect(normalizeRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeHideStrategy("display-none")).toBe("display-none");
        expect(normalizeElementTag(undefined)).toBe("p");
        expect(normalizeElementTag("span")).toBe("span");
    });

    it("creates a deterministic private instance with a safe HTML artifact", () => {
        const first = createDomElementPuzzle(knownSpec("dom-element-1"));
        const second = createDomElementPuzzle(knownSpec("dom-element-1"));
        const metadata = first.extensions.domElement as {
            templateVersion: string;
            payloadRole: string;
            recognitionLevel: string;
            hideStrategy: string;
            elementTag: string;
            hasDomInspectionHint: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("dom-element-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("dom-element");
        expect(first.artifact.kind).toBe("html");
        expect(first.artifact.mediaType).toBe("text/html");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["visible_page_text", "hidden_dom_payload", "hide_strategy"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["html-visible-text", "hidden-dom-text", "dom-hide-strategy"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(extractHiddenDomPayloads(getHtmlEntrySource(first.artifact))).toEqual(["DEPLOY-742"]);
        expect(getHtmlEntrySource(first.artifact)).toContain('data-puzzle-role="hidden-payload"');
        expect(getHtmlEntrySource(first.artifact)).toContain(".hidden-payload { display: none; }");
        expect(first.prompt).toBe("Open the webpage artifact and recover the hidden DOM message.");
        expect(metadata.templateVersion).toBe("safe-static-hidden-dom-element-v1");
        expect(metadata.payloadRole).toBe("hidden-payload");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.hideStrategy).toBe("display-none");
        expect(metadata.elementTag).toBe("p");
        expect(metadata.hasDomInspectionHint).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertSafeStaticHtml(getHtmlEntrySource(first.artifact))).not.toThrow();
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("HTML-escapes visible text and hidden payloads", () => {
        const puzzle = createDomElementPuzzle({
            id: "dom-element-escape",
            intendedSolution: "KEEP <CASE> & go",
            visibleTitle: "Build <Status>",
            visibleBody: "Check A & B before 'launch' and \"handoff\".",
            recognitionLevel: "contextual",
            hideStrategy: "hidden-attribute",
            elementTag: "span"
        });

        expect(getHtmlEntrySource(puzzle.artifact)).toContain("<title>Build &lt;Status&gt;</title>");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('Check A &amp; B before &#39;launch&#39; and &quot;handoff&quot;.');
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("KEEP &lt;CASE&gt; &amp; go");
        expect(extractHiddenDomPayloads(getHtmlEntrySource(puzzle.artifact))).toEqual(["KEEP <CASE> & go"]);
        expect(removeMarkedHiddenPayload(getHtmlEntrySource(puzzle.artifact))).not.toContain("KEEP <CASE> & go");
    });

    it("supports all static hiding strategies", () => {
        const hiddenAttribute = createDomElementPuzzle({
            ...knownSpec("strategy-hidden-attribute"),
            hideStrategy: "hidden-attribute"
        });
        const displayNone = createDomElementPuzzle({
            ...knownSpec("strategy-display-none"),
            hideStrategy: "display-none"
        });
        const visuallyHidden = createDomElementPuzzle({
            ...knownSpec("strategy-visually-hidden"),
            hideStrategy: "visually-hidden"
        });
        const colorMatch = createDomElementPuzzle({
            ...knownSpec("strategy-color-match"),
            hideStrategy: "color-match"
        });

        expect(getHtmlEntrySource(hiddenAttribute.artifact)).toContain('<p hidden data-puzzle-role="hidden-payload">');
        expect(getHtmlEntrySource(displayNone.artifact)).toContain("display: none");
        expect(getHtmlEntrySource(visuallyHidden.artifact)).toContain("left: -10000px");
        expect(getHtmlEntrySource(visuallyHidden.artifact)).toContain("overflow: hidden");
        expect(getHtmlEntrySource(colorMatch.artifact)).toContain("color: #ffffff");
        expect(getHtmlEntrySource(colorMatch.artifact)).toContain("background-color: #ffffff");
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createDomElementPuzzle(knownSpec("dom-element-2"));

        expect(validateNormalizedTextAnswer(puzzle, " DEPLOY-742 ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "deploy-742")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "DEPLOY 742")).toBe(false);
    });

    it("supports intentional accepted alternatives", () => {
        const puzzle = createDomElementPuzzle({
            ...knownSpec("dom-element-3"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-17")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the public hidden element", () => {
        const puzzle = createDomElementPuzzle(knownSpec("dom-element-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain('data-puzzle-role="hidden-payload"');
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain("DEPLOY-742");
        expect(removeMarkedHiddenPayload(getHtmlEntrySource(publicPuzzle.artifact))).not.toContain("DEPLOY-742");
    });

    it("enforces recognition-level hint policy", () => {
        expect(() => createDomElementPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require a DOM-inspection hint");

        expect(() => createDomElementPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            domInspectionHint: "Inspect the DOM."
        })).toThrow("must not include a DOM-inspection hint");

        const explicit = createDomElementPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            domInspectionHint: "Inspect the page structure for a hidden node."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("dom_inspection_hint");
        expect(getHtmlEntrySource(explicit.artifact)).toContain("Inspect the page structure");

        const hidden = createDomElementPuzzle({
            ...knownSpec("hidden-no-hint"),
            recognitionLevel: "hidden"
        });
        expect(hidden.inputs.map((port) => port.key)).not.toContain("dom_inspection_hint");
    });

    it("rejects invalid values", () => {
        expect(() => normalizeDomElementPayload("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeVisibleTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeVisibleBody("B".repeat(1_001))).toThrow("must not exceed 1000");
        expect(() => normalizeDomInspectionHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => normalizeHideStrategy("opacity-zero")).toThrow("hide strategy");
        expect(() => normalizeElementTag("section")).toThrow("element tag");
        expect(() => createDomElementPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
        expect(() => createDomElementPuzzle({
            ...knownSpec("visible-leak"),
            visibleBody: "The answer is DEPLOY-742."
        })).toThrow("must not appear in visible page text");
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
        const puzzle = createDomElementPuzzle(knownSpec("dom-element-preview"));
        const preview = await writeDomElementArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "dom-element", "dom-element-preview", "index.html"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getHtmlEntrySource(puzzle.artifact));
        } finally {
            await rm(path.dirname(preview.path), { force: true, recursive: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createDomElementPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "dom-element-tool-preview",
            intendedSolution: "DEPLOY-742",
            visibleTitle: "Release Dashboard",
            visibleBody: "The page looks complete, but the staging checklist says one DOM node was left behind.",
            recognitionLevel: "contextual",
            hideStrategy: "display-none"
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
                path.join("generated-artifacts", "dom-element", "dom-element-tool-preview", "index.html")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("DEPLOY-742");
            await expect(readFile(payload.artifactPreviewPath, "utf8"))
                .resolves.toContain('data-puzzle-role="hidden-payload">DEPLOY-742');
        } finally {
            await rm(path.dirname(payload.artifactPreviewPath), { force: true, recursive: true });
        }
    });
});
