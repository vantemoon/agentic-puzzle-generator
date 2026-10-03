import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    createSourceCodePuzzle,
    extractSourceCodePayloads,
    normalizeCarrier,
    normalizeCodeLabel,
    normalizeRecognitionLevel,
    normalizeSourceCodePayload,
    normalizeSourceInspectionHint,
    normalizeVisibleBody,
    normalizeVisibleTitle
} from "../src/agents/source-code/engine.js";
import {
    createSourceCodePuzzleTool,
    writeSourceCodeArtifactPreview
} from "../src/agents/source-code/tool.js";
import {
    assertPrivatePuzzleInstance,
    assertPublicPuzzleInstance,
    getHtmlEntrySource,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "OPEN-VAULT",
    visibleTitle: "Implementation Review",
    visibleBody: "The rendered page is ordinary, but the implementation may say more.",
    carrier: "html-attribute" as const,
    recognitionLevel: "contextual" as const
});

function removePayloadCarriers(source: string): string {
    return source
        .replace(/<meta\b(?=[^>]*data-puzzle-role="source-code-payload")[^>]*>/gi, "")
        .replace(/<style\b(?=[^>]*data-puzzle-role="source-code-payload")[\s\S]*?<\/style>/gi, "")
        .replace(/<template\b(?=[^>]*data-puzzle-role="source-code-payload")[\s\S]*?<\/template>/gi, "");
}

describe("source-code engine", () => {
    it("normalizes fields", () => {
        expect(normalizeSourceCodePayload("  OPEN   VAULT  ")).toBe("OPEN VAULT");
        expect(normalizeVisibleTitle("  Implementation   Review  ")).toBe("Implementation Review");
        expect(normalizeVisibleBody("  Inspect   carefully.  ")).toBe("Inspect carefully.");
        expect(normalizeSourceInspectionHint("  Check   source.  ")).toBe("Check source.");
        expect(normalizeSourceInspectionHint(undefined)).toBeUndefined();
        expect(normalizeCodeLabel("Implementation Note!")).toBe("implementation-note");
        expect(normalizeCarrier("css-custom-property")).toBe("css-custom-property");
        expect(normalizeRecognitionLevel("hidden")).toBe("hidden");
    });

    it("creates a deterministic hidden-information source-code puzzle", () => {
        const first = createSourceCodePuzzle(knownSpec("source-code-1"));
        const second = createSourceCodePuzzle(knownSpec("source-code-1"));
        const metadata = first.extensions.sourceCode as {
            templateVersion: string;
            carrier: string;
            recognitionLevel: string;
            requiresJavaScriptExecution: boolean;
            liveNavigationSupported: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("source-code-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("source-code");
        expect(first.artifact.kind).toBe("html");
        expect(first.artifact.mediaType).toBe("text/html");
        expect(getHtmlEntrySource(first.artifact)).toContain('data-puzzle-role="source-code-payload"');
        expect(extractSourceCodePayloads(getHtmlEntrySource(first.artifact), "html-attribute")).toEqual(["OPEN-VAULT"]);
        expect(first.prompt).toBe("Open the webpage artifact and recover the message hidden in the page source code.");
        expect(metadata.templateVersion).toBe("safe-static-source-code-v1");
        expect(metadata.carrier).toBe("html-attribute");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.requiresJavaScriptExecution).toBe(false);
        expect(metadata.liveNavigationSupported).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("supports all source-code carriers", () => {
        const carriers = [
            "html-attribute",
            "css-custom-property",
            "javascript-source",
            "asset-reference",
            "encoded-source-value"
        ] as const;

        for (const carrier of carriers) {
            const puzzle = createSourceCodePuzzle({
                ...knownSpec(`source-code-${carrier}`),
                carrier,
                codeLabel: "release token"
            });
            expect(extractSourceCodePayloads(getHtmlEntrySource(puzzle.artifact), carrier)).toEqual(["OPEN-VAULT"]);
        }
    });

    it("keeps JavaScript source non-executable and rejects unsafe source patterns through static HTML policy", () => {
        const puzzle = createSourceCodePuzzle({
            ...knownSpec("source-code-js"),
            carrier: "javascript-source"
        });

        expect(getHtmlEntrySource(puzzle.artifact)).toContain("<template");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('data-source-kind="javascript"');
        expect(getHtmlEntrySource(puzzle.artifact)).not.toContain("<script");
        expect(getHtmlEntrySource(puzzle.artifact)).not.toContain("onclick=");
        expect(getHtmlEntrySource(puzzle.artifact)).not.toContain("javascript:");
        expect(getHtmlEntrySource(puzzle.artifact)).not.toContain("https://");
    });

    it("escapes visible text and source payloads", () => {
        const puzzle = createSourceCodePuzzle({
            id: "source-code-escape",
            intendedSolution: "KEEP <CASE> & go",
            visibleTitle: "Implementation <Review>",
            visibleBody: "Rendered text uses A & B plus 'quotes'.",
            carrier: "css-custom-property",
            recognitionLevel: "explicit",
            sourceInspectionHint: "Inspect the page's \"style\" source."
        });

        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Implementation &lt;Review&gt;");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Rendered text uses A &amp; B plus &#39;quotes&#39;.");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Inspect the page&#39;s &quot;style&quot; source.");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('"KEEP &lt;CASE&gt; &amp; go"');
        expect(extractSourceCodePayloads(getHtmlEntrySource(puzzle.artifact), "css-custom-property"))
            .toEqual(["KEEP <CASE> & go"]);
    });

    it("enforces recognition-level hint policy", () => {
        expect(() => createSourceCodePuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require a source-inspection hint");

        expect(() => createSourceCodePuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            sourceInspectionHint: "Inspect source."
        })).toThrow("must not include a source-inspection hint");

        const explicit = createSourceCodePuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            sourceInspectionHint: "Inspect source."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("source_inspection_hint");
    });

    it("uses deterministic case-sensitive normalized answer validation and alternatives", () => {
        const puzzle = createSourceCodePuzzle({
            ...knownSpec("source-code-validation"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, " artifact/ref-17 ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the intended public source clue", () => {
        const puzzle = createSourceCodePuzzle(knownSpec("source-code-public"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain("OPEN-VAULT");
        expect(removePayloadCarriers(getHtmlEntrySource(publicPuzzle.artifact))).not.toContain("OPEN-VAULT");
    });

    it("rejects invalid values and visible leaks", () => {
        expect(() => normalizeSourceCodePayload("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeVisibleTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeVisibleBody("B".repeat(1_001))).toThrow("must not exceed 1000");
        expect(() => normalizeSourceInspectionHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeCarrier("live-script")).toThrow("source-code carrier");
        expect(() => normalizeRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => createSourceCodePuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createSourceCodePuzzle({
            ...knownSpec("visible-leak"),
            visibleBody: "The answer is OPEN-VAULT."
        })).toThrow("must not appear in visible page text");
    });

    it("exports a local HTML preview file for demo viewing", async () => {
        const puzzle = createSourceCodePuzzle(knownSpec("source-code-preview"));
        const preview = await writeSourceCodeArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "source-code", "source-code-preview", "index.html"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getHtmlEntrySource(puzzle.artifact));
        } finally {
            await rm(path.dirname(preview.path), { force: true, recursive: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createSourceCodePuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "source-code-tool",
            intendedSolution: "OPEN-VAULT",
            visibleTitle: "Implementation Review",
            visibleBody: "The rendered page is ordinary, but the implementation may say more.",
            carrier: "html-attribute",
            recognitionLevel: "contextual"
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") throw new Error("Expected text tool content.");
        const payload = JSON.parse(textContent.text) as {
            id: string;
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            answer: string;
        };

        try {
            expect(payload.id).toBe("source-code-tool");
            expect(payload.artifactPreviewPath).toBe(
                path.join("generated-artifacts", "source-code", "source-code-tool", "index.html")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("OPEN-VAULT");
            await expect(readFile(payload.artifactPreviewPath, "utf8"))
                .resolves.toContain('data-puzzle-role="source-code-payload"');
        } finally {
            await rm(path.dirname(payload.artifactPreviewPath), { force: true, recursive: true });
        }
    });
});
