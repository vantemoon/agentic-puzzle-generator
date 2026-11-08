import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertSafeStaticHtml,
    createPageVersionPuzzle,
    escapeHtmlText,
    extractPageVersionPayloads,
    normalizePageVersionChangeKind,
    normalizePageVersionSolution,
    normalizePageVersionTitle,
    normalizeVersionDate
} from "../src/agents/page-version/engine.js";
import {
    createPageVersionPuzzleTool,
    writePageVersionArtifactPreview
} from "../src/agents/page-version/tool.js";
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
    pageTitle: "Release Archive",
    baselineBody: "The archived release page lists routine maintenance notes.",
    currentBody: "The current release page lists routine maintenance notes.",
    changeKind: "added-section" as const,
    baselineDate: "2024-04-01",
    currentDate: "2024-04-02",
    baselineLabel: "Original release",
    currentLabel: "Updated release"
});

function getArtifactFileSource(puzzle: ReturnType<typeof createPageVersionPuzzle>, filePath: string): string {
    if (puzzle.artifact.kind !== "html") throw new Error("Expected HTML artifact.");
    const file = puzzle.artifact.files.find((candidate) => candidate.path === filePath);
    if (file === undefined) throw new Error(`Missing artifact file ${filePath}.`);
    return file.source;
}

function removeMarkedPayload(source: string): string {
    return source.replace(/<[^>]+data-puzzle-role=["']page-version-payload["'][^>]*>[\s\S]*?<\/[^>]+>/g, "");
}

describe("page-version engine", () => {
    it("normalizes documented fields", () => {
        expect(normalizePageVersionSolution("  OPEN   VAULT  ")).toBe("OPEN VAULT");
        expect(normalizePageVersionTitle("  Release   Archive  ")).toBe("Release Archive");
        expect(normalizeVersionDate("2024-04-01", "version date")).toBe("2024-04-01");
        expect(normalizePageVersionChangeKind("changed-field")).toBe("changed-field");
    });

    it("creates a deterministic private instance with a multi-file safe HTML artifact", () => {
        const first = createPageVersionPuzzle(knownSpec("page-version-1"));
        const second = createPageVersionPuzzle(knownSpec("page-version-1"));
        const metadata = first.extensions.pageVersion as {
            templateVersion: string;
            changeKind: string;
            baselinePath: string;
            currentPath: string;
            comparisonMode: string;
            requiresJavaScriptExecution: boolean;
            liveNavigationSupported: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("page-version-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("page-version");
        expect(first.artifact.kind).toBe("html");
        if (first.artifact.kind !== "html") throw new Error("Expected HTML artifact.");
        expect(first.artifact.mediaType).toBe("text/html");
        expect(first.artifact.entryPath).toBe("/index.html");
        expect(first.artifact.files.map((file) => file.path)).toEqual([
            "/index.html",
            "/versions/2024-04-01.html",
            "/versions/2024-04-02.html"
        ]);
        expect(getHtmlEntrySource(first.artifact)).toContain("Two dated snapshots are available for comparison.");
        expect(getHtmlEntrySource(first.artifact)).toContain("/versions/2024-04-01.html");
        expect(getHtmlEntrySource(first.artifact)).toContain("/versions/2024-04-02.html");
        expect(extractPageVersionPayloads(getArtifactFileSource(first, "/versions/2024-04-01.html"))).toEqual([]);
        expect(extractPageVersionPayloads(getArtifactFileSource(first, "/versions/2024-04-02.html"))).toEqual(["OPEN-VAULT"]);
        expect(first.prompt).toBe("Open the webpage artifact and compare the included page versions to recover the hidden message.");
        expect(metadata.templateVersion).toBe("safe-static-page-version-v2");
        expect(metadata.changeKind).toBe("added-section");
        expect(metadata.comparisonMode).toBe("static-file-comparison");
        expect(metadata.requiresJavaScriptExecution).toBe(false);
        expect(metadata.liveNavigationSupported).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        for (const file of first.artifact.files) expect(() => assertSafeStaticHtml(file.source)).not.toThrow();
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("HTML-escapes visible text and payload values", () => {
        const puzzle = createPageVersionPuzzle({
            id: "page-version-escape",
            intendedSolution: "KEEP <CASE> & go",
            pageTitle: "Archive <Review>",
            baselineBody: "Check A & B before 'launch'.",
            currentBody: "Check A & B before \"handoff\".",
            changeKind: "changed-field",
            baselineDate: "2024-04-01",
            currentDate: "2024-04-02"
        });
        const current = getArtifactFileSource(puzzle, "/versions/2024-04-02.html");

        expect(escapeHtmlText("<A&B>")).toBe("&lt;A&amp;B&gt;");
        expect(getHtmlEntrySource(puzzle.artifact)).toContain("Archive &lt;Review&gt;");
        expect(current).toContain("KEEP &lt;CASE&gt; &amp; go");
        expect(extractPageVersionPayloads(current)).toEqual(["KEEP <CASE> & go"]);
        expect(removeMarkedPayload(current)).not.toContain("KEEP <CASE> & go");
    });

    it("supports additions, alterations, redaction removal, and removed content", () => {
        for (const changeKind of ["added-section", "changed-field", "removed-content", "removed-redaction"] as const) {
            const puzzle = createPageVersionPuzzle({
                ...knownSpec(`page-version-${changeKind}`),
                ...(changeKind === "removed-content"
                    ? { baselineBody: "The archived release page contains access phrase OPEN-VAULT." }
                    : {}),
                changeKind
            });
            const baseline = getArtifactFileSource(puzzle, "/versions/2024-04-01.html");
            const current = getArtifactFileSource(puzzle, "/versions/2024-04-02.html");
            expect(extractPageVersionPayloads(baseline)).toEqual(
                changeKind === "removed-content" ? ["OPEN-VAULT"] : []
            );
            expect(extractPageVersionPayloads(current)).toEqual(
                changeKind === "removed-content" ? [] : ["OPEN-VAULT"]
            );
        }
    });

    it("uses an intended solution already present in the current page body without duplicating it", () => {
        const puzzle = createPageVersionPuzzle({
            id: "exhibit-announcement-revision",
            intendedSolution: "Community Center Collection",
            pageTitle: "Community Center History Exhibit",
            baselineBody: "Elena Park announces an exhibit about the Riverside Community Center.",
            currentBody: "Research note: the donated album is described in the Community Center Collection public finding aid.",
            changeKind: "added-section",
            baselineDate: "2026-04-03",
            currentDate: "2026-04-12",
            baselineLabel: "Original announcement",
            currentLabel: "Updated research note"
        });
        const current = getArtifactFileSource(puzzle, "/versions/2026-04-12.html");

        expect(extractPageVersionPayloads(current)).toEqual(["Community Center Collection"]);
        expect(current.match(/Community Center Collection/g)).toHaveLength(1);
        expect(current).toContain("Research note: the donated album is described in the");
    });

    it("uses deterministic case-sensitive normalized answer validation", () => {
        const puzzle = createPageVersionPuzzle(knownSpec("page-version-2"));

        expect(validateNormalizedTextAnswer(puzzle, " OPEN-VAULT ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "open-vault")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "OPEN VAULT")).toBe(false);
    });

    it("supports intentional accepted alternatives", () => {
        const puzzle = createPageVersionPuzzle({
            ...knownSpec("page-version-3"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-17")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the public artifact", () => {
        const puzzle = createPageVersionPuzzle(knownSpec("page-version-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getHtmlEntrySource(publicPuzzle.artifact)).toContain("/versions/2024-04-02.html");
        expect(serialized).toContain("OPEN-VAULT");
    });

    it("rejects invalid and unsafe values", () => {
        expect(() => normalizePageVersionSolution("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizePageVersionTitle("   ")).toThrow("must not be empty");
        expect(() => normalizePageVersionChangeKind("diff")).toThrow("change kind");
        expect(() => normalizeVersionDate("2024-02-30", "version date")).toThrow("real calendar date");
        expect(() => createPageVersionPuzzle({
            ...knownSpec("internal-label"),
            currentLabel: "Current finding aid"
        })).toThrow("must not use baseline or current terminology");
        expect(() => createPageVersionPuzzle({
            ...knownSpec("reversed-dates"),
            baselineDate: "2024-04-02",
            currentDate: "2024-04-01"
        })).toThrow("older version date must be earlier");
        expect(() => createPageVersionPuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createPageVersionPuzzle({
            ...knownSpec("visible-leak"),
            baselineBody: "The answer is OPEN-VAULT."
        })).toThrow("must not appear in stable visible text");
        expect(() => createPageVersionPuzzle({
            ...knownSpec("duplicate-current-payload"),
            currentBody: "OPEN-VAULT appears here and OPEN-VAULT appears again."
        })).toThrow("at most once");
        expect(() => assertSafeStaticHtml("<script>alert(1)</script>")).toThrow("static");
        expect(() => assertSafeStaticHtml("<p onclick=\"x()\">Hello</p>")).toThrow("event-handler");
        expect(() => assertSafeStaticHtml("<a href=\"/x\">x</a>")).toThrow("static");
        expect(() => assertSafeStaticHtml("<img src=\"https://example.test/a.png\">")).toThrow("remote resources");
    });

    it("exports all local HTML preview files for demo viewing", async () => {
        const puzzle = createPageVersionPuzzle(knownSpec("page-version-preview"));
        const preview = await writePageVersionArtifactPreview(puzzle);

        try {
            expect(preview.path).toBe(path.join("generated-artifacts", "page-version", "page-version-preview", "index.html"));
            expect(preview.fileUrl).toMatch(/^file:\/\//);
            expect(preview.files.map((file) => file.path)).toEqual([
                "/index.html",
                "/versions/2024-04-01.html",
                "/versions/2024-04-02.html"
            ]);
            await expect(readFile(preview.path, "utf8")).resolves.toBe(getHtmlEntrySource(puzzle.artifact));
            await expect(readFile(path.join(path.dirname(preview.path), "versions", "2024-04-02.html"), "utf8"))
                .resolves.toContain("OPEN-VAULT");
        } finally {
            await rm(path.dirname(preview.path), { force: true, recursive: true });
        }
    });

    it("demo tool responses include a preview URL and answer", async () => {
        const result = await createPageVersionPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "page-version-tool-preview",
            intendedSolution: "OPEN-VAULT",
            pageTitle: "Release Archive",
            baselineBody: "The archived release page lists routine maintenance notes.",
            currentBody: "The current release page lists routine maintenance notes.",
            changeKind: "added-section",
            baselineDate: "2024-04-01",
            currentDate: "2024-04-02"
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") throw new Error("Expected text tool content.");
        const payload = JSON.parse(textContent.text) as {
            artifactPreviewPath: string;
            artifactPreviewUrl: string;
            artifactPreviewDirectory: string;
            answer: string;
        };

        try {
            expect(payload.artifactPreviewPath).toBe(
                path.join("generated-artifacts", "page-version", "page-version-tool-preview", "index.html")
            );
            expect(payload.artifactPreviewUrl).toMatch(/^file:\/\//);
            expect(payload.artifactPreviewDirectory).toBe(path.join("generated-artifacts", "page-version", "page-version-tool-preview"));
            expect(payload.answer).toBe("OPEN-VAULT");
            await expect(readFile(path.join(path.dirname(payload.artifactPreviewPath), "versions", "2024-04-02.html"), "utf8"))
                .resolves.toContain("OPEN-VAULT");
        } finally {
            await rm(path.dirname(payload.artifactPreviewPath), { force: true, recursive: true });
        }
    });
});
