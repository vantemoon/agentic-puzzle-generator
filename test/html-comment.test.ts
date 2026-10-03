import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertSafeStaticHtml,
    createHtmlCommentPuzzle,
    escapeHtmlText,
    extractHtmlComments,
    normalizeCommentPrefix,
    normalizeHtmlCommentSolution,
    normalizeRecognitionLevel,
    normalizeSourceInspectionHint,
    normalizeVisibleBody,
    normalizeVisibleTitle
} from "../src/agents/html-comment/engine.js";
import {
    createHtmlCommentPuzzleTool,
    writeHtmlArtifactPreview
} from "../src/agents/html-comment/tool.js";
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
    visibleTitle: "Release Notes",
    visibleBody: "The staging page looks normal, but the deployment checklist mentions a leftover developer note.",
    recognitionLevel: "contextual" as const,
    commentPrefix: "DEV NOTE"
});

function stripComments(source: string): string {
    return source.replace(/<!--[\s\S]*?-->/g, "");
}

describe("HTML comment engine", () => {
    it("normalizes documented text fields and recognition levels", () => {
        expect(normalizeHtmlCommentSolution("  OPEN   VAULT  ")).toBe("OPEN VAULT");
        expect(normalizeVisibleTitle("  Release   Notes  ")).toBe("Release Notes");
        expect(normalizeVisibleBody("  Staging   page  ")).toBe("Staging page");
        expect(normalizeSourceInspectionHint("  Check   what was left behind  "))
            .toBe("Check what was left behind");
        expect(normalizeSourceInspectionHint(undefined)).toBeUndefined();
        expect(normalizeCommentPrefix("  todo  ")).toBe("TODO");
        expect(normalizeRecognitionLevel("hidden")).toBe("hidden");
    });

    it("creates a deterministic private instance with a safe HTML artifact", () => {
        const first = createHtmlCommentPuzzle(knownSpec("html-comment-1"));
        const second = createHtmlCommentPuzzle(knownSpec("html-comment-1"));
        const metadata = first.extensions.htmlComment as {
            templateVersion: string;
            recognitionLevel: string;
            commentPrefix: string;
            hasSourceInspectionHint: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("html-comment-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("html-comment");
        expect(first.artifact.kind).toBe("html");
        expect(first.artifact.mediaType).toBe("text/html");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["visible_page_text", "html_comment_payload"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["html-visible-text", "html-comment-payload"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(extractHtmlComments(getHtmlEntrySource(first.artifact))).toEqual(["DEV NOTE: OPEN-VAULT"]);
        expect(first.prompt).toBe("Open the webpage artifact and recover the hidden message.");
        expect(metadata.templateVersion).toBe("safe-static-html-comment-v1");
        expect(metadata.recognitionLevel).toBe("contextual");
        expect(metadata.commentPrefix).toBe("DEV NOTE");
        expect(metadata.hasSourceInspectionHint).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertSafeStaticHtml(getHtmlEntrySource(first.artifact))).not.toThrow();
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("HTML-escapes visible text while keeping the hidden payload in exactly one comment", () => {
        const puzzle = createHtmlCommentPuzzle({
            id: "html-comment-escape",
            intendedSolution: "KEEP&CASE",
            visibleTitle: "Build <Status>",
            visibleBody: "Check A & B before 'launch' and \"handoff\".",
            recognitionLevel: "contextual"
        });

        expect(escapeHtmlText("<A&B>")).toBe("&lt;A&amp;B&gt;");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("<title>Build &lt;Status&gt;</title>");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain('Check A &amp; B before &#39;launch&#39; and &quot;handoff&quot;.');
        expect(extractHtmlComments(getHtmlEntrySource(puzzle.artifact))).toEqual(["DEV NOTE: KEEP&CASE"]);
        expect(stripComments(getHtmlEntrySource(puzzle.artifact))).not.toContain("KEEP&CASE");
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createHtmlCommentPuzzle(knownSpec("html-comment-2"));

        expect(validateNormalizedTextAnswer(puzzle, " OPEN-VAULT ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "open-vault")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "OPEN VAULT")).toBe(false);
    });

    it("supports intentional accepted alternatives", () => {
        const puzzle = createHtmlCommentPuzzle({
            ...knownSpec("html-comment-3"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-17")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the public artifact comment", () => {
        const puzzle = createHtmlCommentPuzzle(knownSpec("html-comment-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain("<!-- DEV NOTE: OPEN-VAULT -->");
        expect(stripComments(getHtmlEntrySource(publicPuzzle.artifact))).not.toContain("OPEN-VAULT");
    });

    it("enforces recognition-level hint policy", () => {
        expect(() => createHtmlCommentPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require a source-inspection hint");

        expect(() => createHtmlCommentPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            sourceInspectionHint: "View the source."
        })).toThrow("must not include a source-inspection hint");

        const explicit = createHtmlCommentPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            sourceInspectionHint: "Inspect the page source for a developer note."
        });
        expect(explicit.inputs.map((port) => port.key)).toContain("source_inspection_hint");
        expect(getHtmlEntrySource(explicit.artifact)).toContain("Inspect the page source");

        const hidden = createHtmlCommentPuzzle({
            ...knownSpec("hidden-no-hint"),
            recognitionLevel: "hidden"
        });
        expect(hidden.inputs.map((port) => port.key)).not.toContain("source_inspection_hint");
    });

    it("rejects invalid values and unsafe comments", () => {
        expect(() => normalizeHtmlCommentSolution("bad -- close"))
            .toThrow("must not contain '--' or '>'");
        expect(() => normalizeHtmlCommentSolution("bad > close"))
            .toThrow("must not contain '--' or '>'");
        expect(() => normalizeHtmlCommentSolution("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeVisibleTitle("   ")).toThrow("must not be empty");
        expect(() => normalizeVisibleBody("B".repeat(1_001))).toThrow("must not exceed 1000");
        expect(() => normalizeSourceInspectionHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeCommentPrefix("bad -- prefix")).toThrow("must not contain");
        expect(() => normalizeRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => createHtmlCommentPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
        expect(() => createHtmlCommentPuzzle({
            ...knownSpec("visible-leak"),
            visibleBody: "The answer is OPEN-VAULT."
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
        const puzzle = createHtmlCommentPuzzle(knownSpec("html-comment-preview"));
        const preview = await writeHtmlArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "html-comment", "html-comment-preview", "index.html"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getHtmlEntrySource(puzzle.artifact));
        } finally {
            await rm(path.dirname(preview.path), { force: true, recursive: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createHtmlCommentPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "html-comment-tool-preview",
            intendedSolution: "OPEN-VAULT",
            visibleTitle: "Release Notes",
            visibleBody: "The staging page looks normal, but the deployment checklist mentions a leftover developer note.",
            recognitionLevel: "contextual",
            commentPrefix: "DEV NOTE"
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
                path.join("generated-artifacts", "html-comment", "html-comment-tool-preview", "index.html")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.answer).toBe("OPEN-VAULT");
            await expect(readFile(payload.artifactPreviewPath, "utf8"))
                .resolves.toContain("<!-- DEV NOTE: OPEN-VAULT -->");
        } finally {
            await rm(path.dirname(payload.artifactPreviewPath), { force: true, recursive: true });
        }
    });
});
