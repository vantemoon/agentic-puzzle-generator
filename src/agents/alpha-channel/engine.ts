import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { assertPrivatePuzzleInstance, createPngImageArtifact, type PrivatePuzzleInstance, type PuzzleGenerationSpec } from "../../core/types.js";
import { embedAlphaPayload, extractAlphaPayload } from "../channel-clue/png.js";

export type AlphaChannelRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";

export interface AlphaChannelPuzzleSpec extends PuzzleGenerationSpec {
    coverTheme: string;
    recognitionLevel: AlphaChannelRecognitionLevel;
    alphaInspectionHint?: string;
    acceptedAlternatives?: string[];
    width?: number;
    height?: number;
}

const TEMPLATE_VERSION = "alpha-channel-png-v1";
const LEVELS: readonly AlphaChannelRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 64;
const MIN_DIMENSION = 16;
const MAX_DIMENSION = 256;
const MAX_PAYLOAD = 300;

function normalizeText(input: string, name: string, max: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${name} must not be empty.`);
    if (normalized.length > max) throw new Error(`The ${name} must not exceed ${max} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) throw new Error(`The ${name} may contain printable ASCII and common typographic punctuation.`);
    return normalized;
}

export function normalizeAlphaChannelPayload(input: string): string { return normalizeText(input, "alpha-channel payload", MAX_PAYLOAD); }
export function normalizeAlphaCoverTheme(input: string): string { return normalizeText(input, "cover theme", 120); }
export function normalizeAlphaInspectionHint(input: string | undefined): string | undefined { return input === undefined ? undefined : normalizeText(input, "alpha inspection hint", 300); }
export function normalizeAlphaChannelRecognitionLevel(input: string): AlphaChannelRecognitionLevel {
    if (!LEVELS.includes(input as AlphaChannelRecognitionLevel)) throw new Error(`The recognition level must be one of: ${LEVELS.join(", ")}.`);
    return input as AlphaChannelRecognitionLevel;
}

function dimension(input: number | undefined, fallback: number, name: string): number {
    const value = input ?? fallback;
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) throw new Error(`The ${name} must be an integer from ${MIN_DIMENSION} to ${MAX_DIMENSION}.`);
    return value;
}

function alternatives(values: string[] | undefined): string[] | undefined {
    if (values === undefined) return undefined;
    const normalized = [...new Set(values.map(normalizeAlphaChannelPayload))];
    return normalized.length === 0 ? undefined : normalized;
}

function assertHintPolicy(level: AlphaChannelRecognitionLevel, hint: string | undefined): void {
    if (level === "explicit" && hint === undefined) throw new Error("Explicit alpha-channel puzzles require an alpha inspection hint.");
    if (level === "hidden" && hint !== undefined) throw new Error("Hidden alpha-channel puzzles must not include an alpha inspection hint.");
}

function assertNoLeak(payload: string, coverTheme: string, hint: string | undefined): void {
    if ([coverTheme, hint ?? ""].join("\n").includes(payload)) throw new Error("The alpha-channel payload must not appear in visible public text.");
}

export function createAlphaChannelPuzzle(spec: AlphaChannelPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");
    const payload = normalizeAlphaChannelPayload(spec.intendedSolution);
    const coverTheme = normalizeAlphaCoverTheme(spec.coverTheme);
    const recognitionLevel = normalizeAlphaChannelRecognitionLevel(spec.recognitionLevel);
    const alphaInspectionHint = normalizeAlphaInspectionHint(spec.alphaInspectionHint);
    const acceptedAlternatives = alternatives(spec.acceptedAlternatives);
    const width = dimension(spec.width, DEFAULT_WIDTH, "width");
    const height = dimension(spec.height, DEFAULT_HEIGHT, "height");
    assertHintPolicy(recognitionLevel, alphaInspectionHint);
    assertNoLeak(payload, coverTheme, alphaInspectionHint);

    const pngData = embedAlphaPayload({ width, height, coverSeed: coverTheme, payload });
    if (extractAlphaPayload(pngData) !== payload) throw new Error("Internal validation failed: alpha-channel payload did not round trip.");
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: payload, normalization }
        : { valueType: "text" as const, canonical: payload, acceptedAlternatives, normalization };

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "alpha-channel",
        inputs: [
            { key: "cover_image", valueType: "png-image", description: "A PNG image whose alpha channel encodes a hidden payload.", required: true, constraints: { mediaType: "image/png", channel: "alpha", width, height }, value: { coverTheme, width, height } },
            { key: "alpha_payload", valueType: "hidden-text-payload", description: "The text payload encoded in the PNG alpha channel.", required: true, value: payload },
            ...(alphaInspectionHint === undefined ? [] : [{ key: "alpha_inspection_hint", valueType: "visible-text-hint", description: "Visible hint suggesting alpha-channel inspection.", required: false, value: alphaInspectionHint }])
        ],
        outputs: [{ key: "extracted_payload", valueType: "plain-text", description: "The text recovered from the alpha channel.", value: payload }],
        artifact: createPngImageArtifact(pngData),
        prompt: alphaInspectionHint === undefined ? `Inspect the PNG image (${coverTheme}) and recover the hidden alpha-channel payload.` : `Inspect the PNG image (${coverTheme}). ${alphaInspectionHint}`,
        solution,
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: false, collapseWhitespace: true } },
        externalKnowledge: { required: false },
        extensions: { alphaChannel: { templateVersion: TEMPLATE_VERSION, encodingChannel: "alpha", recognitionLevel, imageFormat: "png", encoding: "base64", width, height, hasAlphaInspectionHint: alphaInspectionHint !== undefined, artifactSha256: createHash("sha256").update(Buffer.from(pngData, "base64")).digest("hex") } }
    };
    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}

export { extractAlphaPayload as extractAlphaChannelPayload };
