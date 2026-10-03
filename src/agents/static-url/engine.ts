import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type StaticUrlManipulationKind =
    | "query-param"
    | "fragment-param"
    | "path-segment"
    | "percent-decoding"
    | "base64-param";

export type StaticUrlRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";

export interface StaticUrlPuzzleSpec extends PuzzleGenerationSpec {
    visibleInstruction: string;
    manipulationKind: StaticUrlManipulationKind;
    baseUrl?: string;
    parameterName?: string;
    pathSegmentIndex?: number;
    recognitionLevel: StaticUrlRecognitionLevel;
    urlInspectionHint?: string;
    acceptedAlternatives?: string[];
}

const DEFAULT_BASE_URL = "https://example.test/archive";
const TEMPLATE_VERSION = "static-url-v1";
const MAX_SOLUTION_LENGTH = 300;
const MAX_INSTRUCTION_LENGTH = 1_000;
const MAX_HINT_LENGTH = 300;
const MANIPULATION_KINDS: readonly StaticUrlManipulationKind[] = [
    "query-param",
    "fragment-param",
    "path-segment",
    "percent-decoding",
    "base64-param"
];
const RECOGNITION_LEVELS: readonly StaticUrlRecognitionLevel[] = [
    "explicit",
    "indirect",
    "contextual",
    "hidden"
];

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) {
        throw new Error(`The ${fieldName} must not be empty.`);
    }
    if (normalized.length > maximumLength) {
        throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    }
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            `The ${fieldName} may contain printable ASCII and common typographic punctuation.`
        );
    }
    return normalized;
}

export function normalizeUrlPayload(input: string): string {
    return normalizeInlineText(input, "URL payload", MAX_SOLUTION_LENGTH);
}

export function normalizeVisibleInstruction(input: string): string {
    return normalizeInlineText(input, "visible instruction", MAX_INSTRUCTION_LENGTH);
}

export function normalizeUrlInspectionHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "URL inspection hint", MAX_HINT_LENGTH);
}

export function normalizeManipulationKind(input: string): StaticUrlManipulationKind {
    if (!MANIPULATION_KINDS.includes(input as StaticUrlManipulationKind)) {
        throw new Error(`The manipulation kind must be one of: ${MANIPULATION_KINDS.join(", ")}.`);
    }
    return input as StaticUrlManipulationKind;
}

export function normalizeRecognitionLevel(input: string): StaticUrlRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as StaticUrlRecognitionLevel)) {
        throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    }
    return input as StaticUrlRecognitionLevel;
}

export function normalizeParameterName(input: string | undefined, kind: StaticUrlManipulationKind): string | undefined {
    if (kind === "path-segment") {
        if (input !== undefined) {
            throw new Error("Path-segment static URL puzzles must not include a parameter name.");
        }
        return undefined;
    }

    const fallback = kind === "base64-param" ? "payload" : kind === "percent-decoding" ? "note" : "token";
    const normalized = (input ?? fallback).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(normalized)) {
        throw new Error(
            "The URL parameter name must start with a letter and contain only letters, digits, underscores, or hyphens."
        );
    }
    return normalized;
}

export function normalizePathSegmentIndex(input: number | undefined): number | undefined {
    if (input === undefined) return undefined;
    if (!Number.isInteger(input) || input < 0 || input > 20) {
        throw new Error("The path segment index must be an integer from 0 through 20.");
    }
    return input;
}

export function normalizeBaseUrl(input: string | undefined): string {
    const raw = input?.trim() ?? DEFAULT_BASE_URL;
    if (raw.includes("/../") || raw.includes("/..") || /%2e/i.test(raw)) {
        throw new Error("The base URL path must not contain parent-directory traversal.");
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("The base URL must be an absolute https://example.test URL.");
    }

    if (url.protocol !== "https:" || url.hostname !== "example.test") {
        throw new Error("The base URL must use https://example.test and must not reference live external hosts.");
    }
    if (url.username !== "" || url.password !== "") {
        throw new Error("The base URL must not include credentials.");
    }
    if (url.search !== "" || url.hash !== "") {
        throw new Error("The base URL must not include existing query parameters or fragments.");
    }
    if (url.pathname.includes("..") || /%2e/i.test(url.pathname)) {
        throw new Error("The base URL path must not contain parent-directory traversal.");
    }

    return url.toString();
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeUrlPayload))];
    return normalized.length > 0 ? normalized : undefined;
}

function toBase64UrlValue(input: string): string {
    return Buffer.from(input, "utf8").toString("base64");
}

export function buildStaticUrl(options: {
    baseUrl: string;
    payload: string;
    manipulationKind: StaticUrlManipulationKind;
    parameterName?: string;
    pathSegmentIndex?: number;
}): { url: string; pathSegmentIndex?: number } {
    const url = new URL(options.baseUrl);

    switch (options.manipulationKind) {
        case "query-param":
            url.searchParams.set(options.parameterName ?? "token", options.payload);
            return { url: url.toString() };
        case "fragment-param":
            url.hash = `${encodeURIComponent(options.parameterName ?? "token")}=${encodeURIComponent(options.payload)}`;
            return { url: url.toString() };
        case "percent-decoding":
            url.searchParams.set(options.parameterName ?? "note", options.payload);
            return { url: url.toString() };
        case "base64-param":
            url.searchParams.set(options.parameterName ?? "payload", toBase64UrlValue(options.payload));
            return { url: url.toString() };
        case "path-segment": {
            const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            const index = options.pathSegmentIndex ?? segments.length;
            if (index > segments.length) {
                throw new Error("The path segment index cannot exceed the number of existing base URL segments.");
            }
            segments.splice(index, 0, options.payload);
            url.pathname = `/${segments.map(encodeURIComponent).join("/")}`;
            return { url: url.toString(), pathSegmentIndex: index };
        }
    }
}

export function extractStaticUrlPayload(options: {
    url: string;
    manipulationKind: StaticUrlManipulationKind;
    parameterName?: string;
    pathSegmentIndex?: number;
}): string {
    const url = new URL(options.url);

    switch (options.manipulationKind) {
        case "query-param":
        case "percent-decoding": {
            const value = url.searchParams.get(options.parameterName ?? "token");
            if (value === null) throw new Error("The URL does not contain the expected query parameter.");
            return value;
        }
        case "fragment-param": {
            const params = new URLSearchParams(url.hash.replace(/^#/, ""));
            const value = params.get(options.parameterName ?? "token");
            if (value === null) throw new Error("The URL fragment does not contain the expected parameter.");
            return value;
        }
        case "base64-param": {
            const encoded = url.searchParams.get(options.parameterName ?? "payload");
            if (encoded === null) throw new Error("The URL does not contain the expected base64 parameter.");
            return Buffer.from(encoded, "base64").toString("utf8");
        }
        case "path-segment": {
            const index = options.pathSegmentIndex;
            if (index === undefined) throw new Error("Path-segment extraction requires a path segment index.");
            const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            const value = segments[index];
            if (value === undefined) throw new Error("The URL does not contain the expected path segment.");
            return value;
        }
    }
}

function assertRecognitionHintPolicy(
    recognitionLevel: StaticUrlRecognitionLevel,
    urlInspectionHint: string | undefined
): void {
    if (recognitionLevel === "explicit" && urlInspectionHint === undefined) {
        throw new Error("Explicit static URL puzzles require a URL inspection hint.");
    }
    if (recognitionLevel === "hidden" && urlInspectionHint !== undefined) {
        throw new Error("Hidden static URL puzzles must not include a URL inspection hint.");
    }
}

function assertSolutionNotInInstruction(solution: string, visibleInstruction: string, urlInspectionHint: string | undefined): void {
    if ([visibleInstruction, urlInspectionHint ?? ""].join("\n").includes(solution)) {
        throw new Error("The URL payload must not appear directly in the visible instruction or hint.");
    }
}

export function createStaticUrlPuzzle(spec: StaticUrlPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeUrlPayload(spec.intendedSolution);
    const visibleInstruction = normalizeVisibleInstruction(spec.visibleInstruction);
    const manipulationKind = normalizeManipulationKind(spec.manipulationKind);
    const recognitionLevel = normalizeRecognitionLevel(spec.recognitionLevel);
    const baseUrl = normalizeBaseUrl(spec.baseUrl);
    const parameterName = normalizeParameterName(spec.parameterName, manipulationKind);
    const pathSegmentIndex = normalizePathSegmentIndex(spec.pathSegmentIndex);
    const urlInspectionHint = normalizeUrlInspectionHint(spec.urlInspectionHint);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    assertRecognitionHintPolicy(recognitionLevel, urlInspectionHint);
    assertSolutionNotInInstruction(solution, visibleInstruction, urlInspectionHint);

    const built = buildStaticUrl({
        baseUrl,
        payload: solution,
        manipulationKind,
        parameterName,
        pathSegmentIndex
    });
    const effectivePathSegmentIndex = built.pathSegmentIndex ?? pathSegmentIndex;
    const extracted = extractStaticUrlPayload({
        url: built.url,
        manipulationKind,
        parameterName,
        pathSegmentIndex: effectivePathSegmentIndex
    });
    if (extracted !== solution) {
        throw new Error("Internal validation failed: static URL payload did not round-trip.");
    }

    const artifactSource = [
        visibleInstruction,
        urlInspectionHint,
        `URL: ${built.url}`
    ].filter((part): part is string => part !== undefined).join("\n\n");

    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solutionRecord = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: solution, normalization }
        : { valueType: "text" as const, canonical: solution, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "static_url",
            valueType: "manipulable-url",
            description: "The static URL containing the hidden or encoded payload.",
            required: true,
            constraints: { host: "example.test", liveNavigationSupported: false },
            value: built.url
        },
        {
            key: "manipulation_kind",
            valueType: "static-url-manipulation-kind",
            description: "The URL component or decoding operation needed to recover the payload.",
            required: true,
            value: manipulationKind
        }
    ];

    if (parameterName !== undefined) {
        inputs.push({
            key: "parameter_name",
            valueType: "url-parameter-name",
            description: "The query or fragment parameter carrying the payload.",
            required: true,
            value: parameterName
        });
    }
    if (effectivePathSegmentIndex !== undefined) {
        inputs.push({
            key: "path_segment_index",
            valueType: "url-path-segment-index",
            description: "The zero-based path segment index carrying the payload.",
            required: true,
            value: effectivePathSegmentIndex
        });
    }
    if (urlInspectionHint !== undefined) {
        inputs.push({
            key: "url_inspection_hint",
            valueType: "url-inspection-hint",
            description: "A visible hint suggesting URL inspection or decoding.",
            required: false,
            value: urlInspectionHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "static-url",
        inputs,
        outputs: [{
            key: "extracted_message",
            valueType: "plain-text",
            description: "The hidden message recovered from the static URL.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
        prompt: "Inspect the provided static URL and recover the hidden message. No live navigation is required.",
        solution: solutionRecord,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            staticUrl: {
                templateVersion: TEMPLATE_VERSION,
                manipulationKind,
                parameterName,
                pathSegmentIndex: effectivePathSegmentIndex,
                baseUrl,
                liveNavigationSupported: false,
                artifactSha256: createHash("sha256").update(artifactSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
