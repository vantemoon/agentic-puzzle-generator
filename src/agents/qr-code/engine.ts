import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSvgImageArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type QrCodeRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type QrCodePayloadKind = "message" | "identifier" | "url";

export interface QrCodePuzzleSpec extends PuzzleGenerationSpec {
    payloadKind: QrCodePayloadKind;
    documentTheme: string;
    recognitionLevel: QrCodeRecognitionLevel;
    scanHint?: string;
    acceptedAlternatives?: string[];
    moduleSize?: number;
}

export interface QrCodeMatrix {
    size: number;
    modules: boolean[][];
    reserved: boolean[][];
    dataCodewords: number[];
    errorCorrectionCodewords: number[];
    payload: string;
}

const TEMPLATE_VERSION = "qr-code-svg-v1";
const VERSION = 1;
const SIZE = 21;
const DATA_CODEWORDS = 19;
const ECC_CODEWORDS = 7;
const MAX_BYTE_PAYLOAD = 17;
const FORMAT_BITS_L_MASK_0 = 0x77c4;
const RECOGNITION_LEVELS: readonly QrCodeRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const PAYLOAD_KINDS: readonly QrCodePayloadKind[] = ["message", "identifier", "url"];

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E]/.test(normalized)) throw new Error(`The ${fieldName} may contain printable ASCII only.`);
    return normalized;
}

export function normalizeQrCodePayload(input: string): string {
    const normalized = normalizeInlineText(input, "QR-code payload", 300);
    const byteLength = Buffer.byteLength(normalized, "utf8");
    if (byteLength > MAX_BYTE_PAYLOAD) throw new Error(`Version 1-L QR-code payloads must not exceed ${MAX_BYTE_PAYLOAD} UTF-8 bytes.`);
    return normalized;
}

export function normalizeQrDocumentTheme(input: string): string {
    return normalizeInlineText(input, "document theme", 160);
}

export function normalizeQrScanHint(input: string | undefined): string | undefined {
    return input === undefined ? undefined : normalizeInlineText(input, "QR scan hint", 300);
}

export function normalizeQrCodeRecognitionLevel(input: string): QrCodeRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as QrCodeRecognitionLevel)) throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    return input as QrCodeRecognitionLevel;
}

export function normalizeQrCodePayloadKind(input: string): QrCodePayloadKind {
    if (!PAYLOAD_KINDS.includes(input as QrCodePayloadKind)) throw new Error(`The payload kind must be one of: ${PAYLOAD_KINDS.join(", ")}.`);
    return input as QrCodePayloadKind;
}

function normalizeModuleSize(input: number | undefined): number {
    const value = input ?? 8;
    if (!Number.isInteger(value) || value < 4 || value > 24) throw new Error("The module size must be an integer from 4 to 24.");
    return value;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeQrCodePayload))];
    return normalized.length > 0 ? normalized : undefined;
}

function assertHintPolicy(level: QrCodeRecognitionLevel, hint: string | undefined): void {
    if (level === "explicit" && hint === undefined) throw new Error("Explicit QR-code puzzles require a scan hint.");
    if (level === "hidden" && hint !== undefined) throw new Error("Hidden QR-code puzzles must not include a scan hint.");
}

function assertPayloadNotLeaked(options: { payload: string; documentTheme: string; scanHint?: string }): void {
    if ([options.documentTheme, options.scanHint ?? ""].join("\n").includes(options.payload)) throw new Error("The QR-code payload must not appear in visible public text.");
}

function emptyMatrix(): QrCodeMatrix {
    return {
        size: SIZE,
        modules: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false)),
        reserved: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false)),
        dataCodewords: [],
        errorCorrectionCodewords: [],
        payload: ""
    };
}

function setModule(matrix: QrCodeMatrix, row: number, col: number, value: boolean, reserve = true): void {
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;
    matrix.modules[row][col] = value;
    if (reserve) matrix.reserved[row][col] = true;
}

function drawFinder(matrix: QrCodeMatrix, row: number, col: number): void {
    for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
            const r = row + y;
            const c = col + x;
            const inFinder = y >= 0 && y <= 6 && x >= 0 && x <= 6;
            const dark = inFinder && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
            setModule(matrix, r, c, dark, true);
        }
    }
}

function drawFunctionPatterns(matrix: QrCodeMatrix): void {
    drawFinder(matrix, 0, 0);
    drawFinder(matrix, 0, SIZE - 7);
    drawFinder(matrix, SIZE - 7, 0);
    for (let index = 8; index <= SIZE - 9; index += 1) {
        setModule(matrix, 6, index, index % 2 === 0, true);
        setModule(matrix, index, 6, index % 2 === 0, true);
    }
    setModule(matrix, SIZE - 8, 8, true, true);

    // Reserve format info modules; actual bits are written after data masking.
    for (let index = 0; index < 9; index += 1) {
        if (index !== 6) {
            matrix.reserved[8][index] = true;
            matrix.reserved[index][8] = true;
        }
    }
    for (let index = 0; index < 8; index += 1) {
        matrix.reserved[8][SIZE - 1 - index] = true;
        matrix.reserved[SIZE - 1 - index][8] = true;
    }
}

function gfMultiply(a: number, b: number): number {
    let result = 0;
    let left = a;
    let right = b;
    while (right > 0) {
        if ((right & 1) !== 0) result ^= left;
        left <<= 1;
        if ((left & 0x100) !== 0) left ^= 0x11d;
        right >>= 1;
    }
    return result;
}

function reedSolomonRemainder(data: number[]): number[] {
    const generator = [127, 122, 154, 164, 11, 68, 117];
    const remainder = Array.from({ length: ECC_CODEWORDS }, () => 0);
    for (const codeword of data) {
        const factor = codeword ^ remainder.shift()!;
        remainder.push(0);
        for (let index = 0; index < ECC_CODEWORDS; index += 1) remainder[index] ^= gfMultiply(generator[index], factor);
    }
    return remainder;
}

function bitsFromNumber(value: number, width: number): number[] {
    return Array.from({ length: width }, (_, index) => (value >> (width - 1 - index)) & 1);
}

function createDataCodewords(payload: string): number[] {
    const bytes = [...Buffer.from(payload, "utf8")];
    const bits = [
        ...bitsFromNumber(0b0100, 4),
        ...bitsFromNumber(bytes.length, 8),
        ...bytes.flatMap((byte) => bitsFromNumber(byte, 8))
    ];
    const capacityBits = DATA_CODEWORDS * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for (let index = 0; index < terminator; index += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const codewords: number[] = [];
    for (let index = 0; index < bits.length; index += 8) codewords.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
    let pad = 0;
    while (codewords.length < DATA_CODEWORDS) {
        codewords.push(pad % 2 === 0 ? 0xec : 0x11);
        pad += 1;
    }
    return codewords;
}

function dataCoordinates(): Array<[number, number]> {
    const coords: Array<[number, number]> = [];
    let upward = true;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
        if (right === 6) right -= 1;
        for (let vertical = 0; vertical < SIZE; vertical += 1) {
            const row = upward ? SIZE - 1 - vertical : vertical;
            for (const col of [right, right - 1]) coords.push([row, col]);
        }
        upward = !upward;
    }
    return coords;
}

function mask0(row: number, col: number): boolean {
    return (row + col) % 2 === 0;
}

function placeData(matrix: QrCodeMatrix, bits: number[]): void {
    let bitIndex = 0;
    for (const [row, col] of dataCoordinates()) {
        if (matrix.reserved[row][col]) continue;
        const raw = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        matrix.modules[row][col] = raw !== mask0(row, col);
        bitIndex += 1;
    }
}

function drawFormatBits(matrix: QrCodeMatrix): void {
    const formatBit = (index: number): boolean => ((FORMAT_BITS_L_MASK_0 >> index) & 1) !== 0;
    for (let index = 0; index <= 5; index += 1) setModule(matrix, index, 8, formatBit(index), true);
    setModule(matrix, 7, 8, formatBit(6), true);
    setModule(matrix, 8, 8, formatBit(7), true);
    setModule(matrix, 8, 7, formatBit(8), true);
    for (let index = 9; index < 15; index += 1) setModule(matrix, 8, 14 - index, formatBit(index), true);

    for (let index = 0; index < 8; index += 1) setModule(matrix, 8, SIZE - 1 - index, formatBit(index), true);
    for (let index = 8; index < 15; index += 1) setModule(matrix, SIZE - 15 + index, 8, formatBit(index), true);
    setModule(matrix, SIZE - 8, 8, true, true);
}

export function createQrCodeMatrix(payload: string): QrCodeMatrix {
    const normalized = normalizeQrCodePayload(payload);
    const matrix = emptyMatrix();
    matrix.payload = normalized;
    drawFunctionPatterns(matrix);
    matrix.dataCodewords = createDataCodewords(normalized);
    matrix.errorCorrectionCodewords = reedSolomonRemainder(matrix.dataCodewords);
    const allCodewords = [...matrix.dataCodewords, ...matrix.errorCorrectionCodewords];
    placeData(matrix, allCodewords.flatMap((codeword) => bitsFromNumber(codeword, 8)));
    drawFormatBits(matrix);
    return matrix;
}

export function extractQrCodePayload(matrix: QrCodeMatrix): string {
    const bits: number[] = [];
    for (const [row, col] of dataCoordinates()) {
        if (matrix.reserved[row][col]) continue;
        const unmasked = matrix.modules[row][col] !== mask0(row, col);
        bits.push(unmasked ? 1 : 0);
    }
    const codewords: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) codewords.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
    const dataBits = codewords.slice(0, DATA_CODEWORDS).flatMap((codeword) => bitsFromNumber(codeword, 8));
    if (Number.parseInt(dataBits.slice(0, 4).join(""), 2) !== 0b0100) throw new Error("QR payload is not encoded in byte mode.");
    const length = Number.parseInt(dataBits.slice(4, 12).join(""), 2);
    const bytes: number[] = [];
    for (let index = 0; index < length; index += 1) bytes.push(Number.parseInt(dataBits.slice(12 + index * 8, 20 + index * 8).join(""), 2));
    return Buffer.from(bytes).toString("utf8");
}

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildQrCodeSvg(payload: string, moduleSize = 8): string {
    const matrix = createQrCodeMatrix(payload);
    const quiet = 4;
    const fullSize = (matrix.size + quiet * 2) * moduleSize;
    const darkModules: string[] = [];
    for (let row = 0; row < matrix.size; row += 1) {
        for (let col = 0; col < matrix.size; col += 1) {
            if (matrix.modules[row][col]) darkModules.push(`<rect x="${(col + quiet) * moduleSize}" y="${(row + quiet) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${fullSize}" height="${fullSize}" viewBox="0 0 ${fullSize} ${fullSize}" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${darkModules.join("")}</g><desc>${escapeXml(`QR code payload length: ${Buffer.byteLength(payload, "utf8")} bytes`)}</desc></svg>`;
}

export function createQrCodePuzzle(spec: QrCodePuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");
    const payload = normalizeQrCodePayload(spec.intendedSolution);
    const payloadKind = normalizeQrCodePayloadKind(spec.payloadKind);
    const documentTheme = normalizeQrDocumentTheme(spec.documentTheme);
    const recognitionLevel = normalizeQrCodeRecognitionLevel(spec.recognitionLevel);
    const scanHint = normalizeQrScanHint(spec.scanHint);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    const moduleSize = normalizeModuleSize(spec.moduleSize);
    assertHintPolicy(recognitionLevel, scanHint);
    assertPayloadNotLeaked({ payload, documentTheme, scanHint });

    const matrix = createQrCodeMatrix(payload);
    if (extractQrCodePayload(matrix) !== payload) throw new Error("Internal validation failed: QR-code payload did not round trip.");
    const svg = buildQrCodeSvg(payload, moduleSize);
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: payload, normalization }
        : { valueType: "text" as const, canonical: payload, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        { key: "qr_code", valueType: "svg-image", description: "A machine-readable QR code containing the hidden payload.", required: true, constraints: { mediaType: "image/svg+xml", version: VERSION, errorCorrection: "L", mask: 0, payloadKind }, value: { documentTheme, payloadKind } },
        { key: "qr_payload", valueType: "hidden-text-payload", description: "The payload encoded in the QR code.", required: true, value: payload }
    ];
    if (scanHint !== undefined) inputs.push({ key: "scan_hint", valueType: "visible-text-hint", description: "Visible hint suggesting QR-code scanning or decoding.", required: false, value: scanHint });

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "qr-code",
        inputs,
        outputs: [{ key: "decoded_payload", valueType: "plain-text", description: "The message, identifier, or URL decoded from the QR code.", value: payload }],
        artifact: createSvgImageArtifact(svg),
        prompt: scanHint === undefined ? `Inspect the machine-readable code on the ${documentTheme} and recover its payload.` : `Inspect the machine-readable code on the ${documentTheme}. ${scanHint}`,
        solution,
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: false, collapseWhitespace: true } },
        externalKnowledge: { required: false },
        extensions: { qrCode: { templateVersion: TEMPLATE_VERSION, qrVersion: VERSION, errorCorrectionLevel: "L", maskPattern: 0, payloadKind, recognitionLevel, mediaType: "image/svg+xml", moduleSize, matrixSize: SIZE, artifactSha256: createHash("sha256").update(svg).digest("hex") } }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
