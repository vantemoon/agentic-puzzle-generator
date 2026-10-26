import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

import { createContextualCoverRgba } from "../../core/contextual-image.js";
import {
    assertPrivatePuzzleInstance,
    createPngImageArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type SteganographyEmbeddingMethod = "png-lsb-rgb";

export interface SteganographyPuzzleSpec extends PuzzleGenerationSpec {
    coverTheme: string;
    acceptedAlternatives?: string[];
    width?: number;
    height?: number;
}

const TEMPLATE_VERSION = "png-lsb-rgb-v1";
const MAGIC = Buffer.from("STEGv1\0", "ascii");
const MAX_SOLUTION_LENGTH = 300;
const MAX_THEME_LENGTH = 120;
const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 64;
const MIN_DIMENSION = 16;
const MAX_DIMENSION = 256;

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizeSteganographyPayload(input: string): string {
    return normalizeInlineText(input, "steganography payload", MAX_SOLUTION_LENGTH);
}

export function normalizeCoverTheme(input: string): string {
    return normalizeInlineText(input, "cover theme", MAX_THEME_LENGTH);
}



function normalizeDimension(input: number | undefined, fallback: number, fieldName: string): number {
    const value = input ?? fallback;
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
        throw new Error(`The ${fieldName} must be an integer from ${MIN_DIMENSION} to ${MAX_DIMENSION}.`);
    }
    return value;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeSteganographyPayload))];
    return normalized.length > 0 ? normalized : undefined;
}


function assertPayloadNotLeaked(options: { payload: string; coverTheme: string }): void {
    const publicText = options.coverTheme;
    if (publicText.includes(options.payload)) {
        throw new Error("The steganography payload must not appear in visible public text.");
    }
}

function payloadPacket(payload: string): Buffer {
    const payloadBytes = Buffer.from(payload, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payloadBytes.length, 0);
    return Buffer.concat([MAGIC, length, payloadBytes]);
}

function bytesToBits(bytes: Buffer): number[] {
    const bits: number[] = [];
    for (const byte of bytes) {
        for (let shift = 7; shift >= 0; shift -= 1) bits.push((byte >> shift) & 1);
    }
    return bits;
}

function bitsToBytes(bits: number[]): Buffer {
    const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
    for (let index = 0; index < bits.length; index += 1) {
        bytes[Math.floor(index / 8)] |= bits[index] << (7 - (index % 8));
    }
    return bytes;
}

function createDeterministicCoverRgb(options: { width: number; height: number; description: string }): Buffer {
    const rgba = createContextualCoverRgba(options.width, options.height, options.description);
    const rgb = Buffer.alloc(options.width * options.height * 3);
    for (let pixel = 0; pixel < options.width * options.height; pixel += 1) {
        rgb[pixel * 3] = rgba[pixel * 4];
        rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1];
        rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2];
    }
    return rgb;
}

export function embedPngLsbRgb(options: { width: number; height: number; coverTheme: string; payload: string }): string {
    const packet = payloadPacket(options.payload);
    const bits = bytesToBits(packet);
    const capacityBits = options.width * options.height * 3;
    if (bits.length > capacityBits) {
        throw new Error(`The payload is too large for the configured PNG cover capacity (${capacityBits} bits).`);
    }

    const rgb = createDeterministicCoverRgb({ width: options.width, height: options.height, description: options.coverTheme });
    for (let index = 0; index < bits.length; index += 1) {
        rgb[index] = (rgb[index] & 0xfe) | bits[index];
    }
    return encodePngRgb(options.width, options.height, rgb).toString("base64");
}

export function extractPngLsbRgbPayload(base64Png: string): string {
    const { rgb } = decodePngRgb(Buffer.from(base64Png, "base64"));
    const headerBitLength = (MAGIC.length + 4) * 8;
    const headerBits = Array.from({ length: headerBitLength }, (_, index) => rgb[index] & 1);
    const header = bitsToBytes(headerBits);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error("PNG does not contain the expected steganography payload marker.");
    }
    const payloadLength = header.readUInt32BE(MAGIC.length);
    const totalBitLength = headerBitLength + payloadLength * 8;
    if (totalBitLength > rgb.length) {
        throw new Error("PNG steganography payload length exceeds image capacity.");
    }
    const payloadBits = Array.from({ length: payloadLength * 8 }, (_, index) => rgb[headerBitLength + index] & 1);
    return bitsToBytes(payloadBits).toString("utf8");
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePngRgb(width: number, height: number, rgb: Buffer): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const scanlineLength = width * 3;
    const raw = Buffer.alloc((scanlineLength + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const rawOffset = y * (scanlineLength + 1);
        raw[rawOffset] = 0;
        rgb.copy(raw, rawOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
    }

    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0))
    ]);
}

function decodePngRgb(png: Buffer): { width: number; height: number; rgb: Buffer } {
    if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new Error("Expected PNG data.");
    }

    let offset = PNG_SIGNATURE.length;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks: Buffer[] = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.subarray(offset + 4, offset + 8).toString("ascii");
        const data = png.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === "IDAT") {
            idatChunks.push(data);
        } else if (type === "IEND") {
            break;
        }
    }

    if (width <= 0 || height <= 0 || bitDepth !== 8 || colorType !== 2) {
        throw new Error("Only 8-bit truecolor RGB PNG data is supported for LSB extraction.");
    }

    const raw = inflateSync(Buffer.concat(idatChunks));
    const scanlineLength = width * 3;
    const rgb = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
        const rawOffset = y * (scanlineLength + 1);
        if (raw[rawOffset] !== 0) throw new Error("Only PNG filter type 0 is supported for LSB extraction.");
        raw.copy(rgb, y * scanlineLength, rawOffset + 1, rawOffset + 1 + scanlineLength);
    }
    return { width, height, rgb };
}

export function createSteganographyPuzzle(spec: SteganographyPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");

    const payload = normalizeSteganographyPayload(spec.intendedSolution);
    const coverTheme = normalizeCoverTheme(spec.coverTheme);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    const width = normalizeDimension(spec.width, DEFAULT_WIDTH, "width");
    const height = normalizeDimension(spec.height, DEFAULT_HEIGHT, "height");
    assertPayloadNotLeaked({ payload, coverTheme });

    const pngData = embedPngLsbRgb({ width, height, coverTheme, payload });
    const extractedPayload = extractPngLsbRgbPayload(pngData);
    if (extractedPayload !== payload) {
        throw new Error("Internal validation failed: embedded PNG payload did not round trip.");
    }

    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: payload, normalization }
        : { valueType: "text" as const, canonical: payload, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "cover_image",
            valueType: "png-image",
            description: "A generated lossless PNG cover image containing a hidden LSB payload.",
            required: true,
            constraints: { mediaType: "image/png", embeddingMethod: "png-lsb-rgb", width, height },
            value: { coverTheme, width, height }
        },
        {
            key: "embedded_payload",
            valueType: "hidden-text-payload",
            description: "The text payload embedded in the PNG image least significant bits.",
            required: true,
            value: payload
        }
    ];

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "steganography",
        inputs,
        outputs: [{
            key: "extracted_payload",
            valueType: "plain-text",
            description: "The text recovered from the image steganography payload.",
            value: payload
        }],
        artifact: createPngImageArtifact(pngData),
        prompt: `Inspect the generated PNG cover image (${coverTheme}) and recover the hidden payload.`,
        solution,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            steganography: {
                templateVersion: TEMPLATE_VERSION,
                embeddingMethod: "png-lsb-rgb" satisfies SteganographyEmbeddingMethod,
                imageFormat: "png",
                encoding: "base64",
                width,
                height,
                artifactSha256: createHash("sha256").update(Buffer.from(pngData, "base64")).digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
