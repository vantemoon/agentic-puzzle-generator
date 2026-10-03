import { describe, expect, it } from "vitest";

import {
    buildStaticUrl,
    createStaticUrlPuzzle,
    extractStaticUrlPayload,
    normalizeBaseUrl,
    normalizeManipulationKind,
    normalizeParameterName,
    normalizePathSegmentIndex,
    normalizeRecognitionLevel,
    normalizeUrlInspectionHint,
    normalizeUrlPayload,
    normalizeVisibleInstruction
} from "../src/agents/static-url/engine.js";
import { createStaticUrlPuzzleTool } from "../src/agents/static-url/tool.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "OPEN-VAULT",
    visibleInstruction: "Inspect the archive URL and recover the hidden token.",
    manipulationKind: "query-param" as const,
    parameterName: "token",
    recognitionLevel: "contextual" as const
});

describe("static-url engine", () => {
    it("normalizes fields", () => {
        expect(normalizeUrlPayload("  OPEN   VAULT  ")).toBe("OPEN VAULT");
        expect(normalizeVisibleInstruction("  Inspect   the URL.  ")).toBe("Inspect the URL.");
        expect(normalizeUrlInspectionHint("  Check   the query string.  ")).toBe("Check the query string.");
        expect(normalizeUrlInspectionHint(undefined)).toBeUndefined();
        expect(normalizeManipulationKind("base64-param")).toBe("base64-param");
        expect(normalizeRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeParameterName(undefined, "query-param")).toBe("token");
        expect(normalizeParameterName(undefined, "base64-param")).toBe("payload");
        expect(normalizeParameterName(undefined, "percent-decoding")).toBe("note");
        expect(normalizeParameterName(undefined, "path-segment")).toBeUndefined();
        expect(normalizePathSegmentIndex(2)).toBe(2);
        expect(normalizePathSegmentIndex(undefined)).toBeUndefined();
        expect(normalizeBaseUrl(undefined)).toBe("https://example.test/archive");
    });

    it("creates a deterministic hidden-information static-url puzzle", () => {
        const first = createStaticUrlPuzzle(knownSpec("static-url-1"));
        const second = createStaticUrlPuzzle(knownSpec("static-url-1"));
        const metadata = first.extensions.staticUrl as {
            templateVersion: string;
            manipulationKind: string;
            parameterName: string;
            liveNavigationSupported: boolean;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("static-url-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("static-url");
        expect(first.artifact).toEqual({
            kind: "text",
            mediaType: "text/plain",
            source: "Inspect the archive URL and recover the hidden token.\n\nURL: https://example.test/archive?token=OPEN-VAULT"
        });
        expect(first.prompt).toBe("Inspect the provided static URL and recover the hidden message. No live navigation is required.");
        expect(first.inputs.map((port) => port.key)).toEqual([
            "static_url",
            "manipulation_kind",
            "parameter_name"
        ]);
        expect(first.outputs[0].value).toBe("OPEN-VAULT");
        expect(metadata.templateVersion).toBe("static-url-v1");
        expect(metadata.manipulationKind).toBe("query-param");
        expect(metadata.parameterName).toBe("token");
        expect(metadata.liveNavigationSupported).toBe(false);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("round-trips all supported manipulation kinds", () => {
        const cases = [
            {
                manipulationKind: "query-param" as const,
                parameterName: "token",
                expectedUrl: "https://example.test/archive?token=OPEN-VAULT"
            },
            {
                manipulationKind: "fragment-param" as const,
                parameterName: "next",
                expectedUrl: "https://example.test/archive#next=OPEN-VAULT"
            },
            {
                manipulationKind: "percent-decoding" as const,
                parameterName: "note",
                expectedUrl: "https://example.test/archive?note=OPEN-VAULT"
            },
            {
                manipulationKind: "base64-param" as const,
                parameterName: "payload",
                expectedUrl: "https://example.test/archive?payload=T1BFTi1WQVVMVA%3D%3D"
            }
        ];

        for (const testCase of cases) {
            const built = buildStaticUrl({
                baseUrl: "https://example.test/archive",
                payload: "OPEN-VAULT",
                manipulationKind: testCase.manipulationKind,
                parameterName: testCase.parameterName
            });
            expect(built.url).toBe(testCase.expectedUrl);
            expect(extractStaticUrlPayload({
                url: built.url,
                manipulationKind: testCase.manipulationKind,
                parameterName: testCase.parameterName
            })).toBe("OPEN-VAULT");
        }

        const pathBuilt = buildStaticUrl({
            baseUrl: "https://example.test/archive/details",
            payload: "OPEN-VAULT",
            manipulationKind: "path-segment",
            pathSegmentIndex: 1
        });
        expect(pathBuilt).toEqual({
            url: "https://example.test/archive/OPEN-VAULT/details",
            pathSegmentIndex: 1
        });
        expect(extractStaticUrlPayload({
            url: pathBuilt.url,
            manipulationKind: "path-segment",
            pathSegmentIndex: 1
        })).toBe("OPEN-VAULT");
    });

    it("builds percent-decoded and base64 puzzles with encoded public URLs", () => {
        const percent = createStaticUrlPuzzle({
            id: "static-url-percent",
            intendedSolution: "OPEN VAULT",
            visibleInstruction: "The note parameter keeps a URL-encoded message.",
            manipulationKind: "percent-decoding",
            parameterName: "note",
            recognitionLevel: "contextual"
        });
        expect(getPuzzleArtifactSource(percent.artifact)).toContain("note=OPEN+VAULT");
        expect(validateNormalizedTextAnswer(percent, "OPEN   VAULT")).toBe(true);

        const base64 = createStaticUrlPuzzle({
            id: "static-url-base64",
            intendedSolution: "OPEN-VAULT",
            visibleInstruction: "The payload parameter uses a familiar compact encoding.",
            manipulationKind: "base64-param",
            parameterName: "payload",
            recognitionLevel: "contextual"
        });
        expect(getPuzzleArtifactSource(base64.artifact)).toContain("payload=T1BFTi1WQVVMVA%3D%3D");
        expect(validateNormalizedTextAnswer(base64, "OPEN-VAULT")).toBe(true);
        expect(validateNormalizedTextAnswer(base64, "open-vault")).toBe(false);
    });

    it("supports path-segment extraction and records the effective index", () => {
        const puzzle = createStaticUrlPuzzle({
            id: "static-url-path",
            intendedSolution: "OPEN-VAULT",
            visibleInstruction: "One path segment in the archive address is not a folder name.",
            manipulationKind: "path-segment",
            baseUrl: "https://example.test/archive/details",
            pathSegmentIndex: 1,
            recognitionLevel: "contextual"
        });
        const metadata = puzzle.extensions.staticUrl as { pathSegmentIndex: number };

        expect(getPuzzleArtifactSource(puzzle.artifact)).toContain("https://example.test/archive/OPEN-VAULT/details");
        expect(puzzle.inputs.map((port) => port.key)).toContain("path_segment_index");
        expect(metadata.pathSegmentIndex).toBe(1);
    });

    it("enforces recognition hint policy", () => {
        expect(() => createStaticUrlPuzzle({
            ...knownSpec("explicit-missing-hint"),
            recognitionLevel: "explicit"
        })).toThrow("require a URL inspection hint");

        expect(() => createStaticUrlPuzzle({
            ...knownSpec("hidden-with-hint"),
            recognitionLevel: "hidden",
            urlInspectionHint: "Check the URL query."
        })).toThrow("must not include a URL inspection hint");

        const explicit = createStaticUrlPuzzle({
            ...knownSpec("explicit-with-hint"),
            recognitionLevel: "explicit",
            urlInspectionHint: "Check the URL query."
        });
        expect(getPuzzleArtifactSource(explicit.artifact)).toContain("Check the URL query.");
        expect(explicit.inputs.map((port) => port.key)).toContain("url_inspection_hint");
    });

    it("rejects unsafe or invalid URL inputs", () => {
        expect(() => normalizeBaseUrl("http://example.test/archive")).toThrow("https://example.test");
        expect(() => normalizeBaseUrl("https://example.com/archive")).toThrow("live external hosts");
        expect(() => normalizeBaseUrl("javascript:alert(1)")).toThrow("https://example.test");
        expect(() => normalizeBaseUrl("https://example.test/archive?x=1")).toThrow("query parameters");
        expect(() => normalizeBaseUrl("https://example.test/a/../b")).toThrow("parent-directory");
        expect(() => normalizeParameterName("1token", "query-param")).toThrow("parameter name");
        expect(() => normalizeParameterName("token", "path-segment")).toThrow("must not include a parameter name");
        expect(() => normalizePathSegmentIndex(21)).toThrow("path segment index");
        expect(() => buildStaticUrl({
            baseUrl: "https://example.test/a",
            payload: "OPEN-VAULT",
            manipulationKind: "path-segment",
            pathSegmentIndex: 2
        })).toThrow("cannot exceed");
    });

    it("rejects invalid text values and visible leaks outside the URL", () => {
        expect(() => normalizeUrlPayload("bad\u0000payload")).toThrow("printable ASCII");
        expect(() => normalizeVisibleInstruction("   ")).toThrow("must not be empty");
        expect(() => normalizeVisibleInstruction("I".repeat(1_001))).toThrow("must not exceed 1000");
        expect(() => normalizeUrlInspectionHint("H".repeat(301))).toThrow("must not exceed 300");
        expect(() => normalizeManipulationKind("route-toggle")).toThrow("manipulation kind");
        expect(() => normalizeRecognitionLevel("obvious")).toThrow("recognition level");
        expect(() => createStaticUrlPuzzle({ ...knownSpec("   ") })).toThrow("ID must not be empty");
        expect(() => createStaticUrlPuzzle({
            ...knownSpec("visible-leak"),
            visibleInstruction: "The answer is OPEN-VAULT."
        })).toThrow("must not appear directly");
    });

    it("supports accepted alternatives", () => {
        const puzzle = createStaticUrlPuzzle({
            ...knownSpec("static-url-alt"),
            intendedSolution: "artifact/ref-17",
            acceptedAlternatives: ["artifact/ref-017"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-17")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "artifact/ref-017")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "ARTIFACT/REF-17")).toBe(false);
    });

    it("creates a public projection that hides private metadata while retaining the public URL", () => {
        const puzzle = createStaticUrlPuzzle(knownSpec("static-url-public"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("https://example.test/archive?token=OPEN-VAULT");
    });

    it("tool responses include artifact text and answer", async () => {
        const result = await createStaticUrlPuzzleTool.execute("tool-call-1", {
            mode: "demo",
            id: "static-url-tool",
            intendedSolution: "OPEN-VAULT",
            visibleInstruction: "Inspect the archive URL and recover the hidden token.",
            manipulationKind: "query-param",
            parameterName: "token",
            recognitionLevel: "contextual"
        });
        const textContent = result.content[0];
        if (textContent.type !== "text") {
            throw new Error("Expected text tool content.");
        }
        const payload = JSON.parse(textContent.text) as {
            id: string;
            artifact: string;
            answer: string;
        };

        expect(payload.id).toBe("static-url-tool");
        expect(payload.artifact).toContain("https://example.test/archive?token=OPEN-VAULT");
        expect(payload.answer).toBe("OPEN-VAULT");
    });
});
