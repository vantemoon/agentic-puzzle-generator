import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { assertPrivatePuzzleInstance, createPngImageArtifact, type PrivatePuzzleInstance, type PuzzleGenerationSpec } from "../../core/types.js";
import { embedColorPayload, extractColorPayload, type ColorChannel } from "../channel-clue/png.js";

export type { ColorChannel };

export interface ColorChannelPuzzleSpec extends PuzzleGenerationSpec {
    coverTheme: string;
    channel: ColorChannel;
    acceptedAlternatives?: string[];
    width?: number;
    height?: number;
}

const TEMPLATE_VERSION = "color-channel-png-v1";
const CHANNELS: readonly ColorChannel[] = ["red", "green", "blue"];
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

export function normalizeColorChannelPayload(input: string): string { return normalizeText(input, "color-channel payload", MAX_PAYLOAD); }
export function normalizeColorCoverTheme(input: string): string { return normalizeText(input, "cover theme", 120); }
export function normalizeColorChannel(input: string): ColorChannel {
    if (!CHANNELS.includes(input as ColorChannel)) throw new Error(`The color channel must be one of: ${CHANNELS.join(", ")}.`);
    return input as ColorChannel;
}

function dimension(input: number | undefined, fallback: number, name: string): number {
    const value = input ?? fallback;
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) throw new Error(`The ${name} must be an integer from ${MIN_DIMENSION} to ${MAX_DIMENSION}.`);
    return value;
}

function alternatives(values: string[] | undefined): string[] | undefined {
    if (values === undefined) return undefined;
    const normalized = [...new Set(values.map(normalizeColorChannelPayload))];
    return normalized.length === 0 ? undefined : normalized;
}


function assertNoLeak(payload: string, coverTheme: string): void {
    if (coverTheme.includes(payload)) throw new Error("The color-channel payload must not appear in visible public text.");
}

export function createColorChannelPuzzle(spec: ColorChannelPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");
    const payload = normalizeColorChannelPayload(spec.intendedSolution);
    const coverTheme = normalizeColorCoverTheme(spec.coverTheme);
    const channel = normalizeColorChannel(spec.channel);
    const acceptedAlternatives = alternatives(spec.acceptedAlternatives);
    const width = dimension(spec.width, DEFAULT_WIDTH, "width");
    const height = dimension(spec.height, DEFAULT_HEIGHT, "height");
    assertNoLeak(payload, coverTheme);

    const pngData = embedColorPayload({ width, height, coverSeed: coverTheme, payload, channel });
    if (extractColorPayload(pngData, channel) !== payload) throw new Error("Internal validation failed: color-channel payload did not round trip.");
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: payload, normalization }
        : { valueType: "text" as const, canonical: payload, acceptedAlternatives, normalization };

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "color-channel",
        inputs: [
            { key: "cover_image", valueType: "png-image", description: "A PNG image with a hidden payload encoded in one RGB channel.", required: true, constraints: { mediaType: "image/png", channel, width, height }, value: { coverTheme, width, height, channel } },
            { key: "channel_payload", valueType: "hidden-text-payload", description: "The text payload encoded in the selected RGB channel.", required: true, value: payload },
        ],
        outputs: [{ key: "extracted_payload", valueType: "plain-text", description: "The text recovered from the selected color channel.", value: payload }],
        artifact: createPngImageArtifact(pngData),
        prompt: `Inspect the PNG image (${coverTheme}) and recover the hidden color-channel payload.`,
        solution,
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: false, collapseWhitespace: true } },
        externalKnowledge: { required: false },
        extensions: { colorChannel: { templateVersion: TEMPLATE_VERSION, encodingChannel: channel, imageFormat: "png", encoding: "base64", width, height, artifactSha256: createHash("sha256").update(Buffer.from(pngData, "base64")).digest("hex") } }
    };
    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}

export { extractColorPayload as extractColorChannelPayload };
