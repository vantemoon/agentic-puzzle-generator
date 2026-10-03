import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAGIC = Buffer.from("CHANv1\0", "ascii");

export interface RgbaPngData {
    width: number;
    height: number;
    rgba: Buffer;
}

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
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

export function encodeRgbaPng(width: number, height: number, rgba: Buffer): string {
    if (rgba.length !== width * height * 4) throw new Error("RGBA data length does not match dimensions.");
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const scanlineLength = width * 4;
    const raw = Buffer.alloc((scanlineLength + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const rawOffset = y * (scanlineLength + 1);
        raw[rawOffset] = 0;
        rgba.copy(raw, rawOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
    }

    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0))
    ]).toString("base64");
}

export function decodeRgbaPng(base64Png: string): RgbaPngData {
    const png = Buffer.from(base64Png, "base64");
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
        } else if (type === "IEND") break;
    }
    if (width <= 0 || height <= 0 || bitDepth !== 8 || colorType !== 6) {
        throw new Error("Only 8-bit RGBA PNG data is supported.");
    }
    const raw = inflateSync(Buffer.concat(idatChunks));
    const scanlineLength = width * 4;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        const rawOffset = y * (scanlineLength + 1);
        if (raw[rawOffset] !== 0) throw new Error("Only PNG filter type 0 is supported.");
        raw.copy(rgba, y * scanlineLength, rawOffset + 1, rawOffset + 1 + scanlineLength);
    }
    return { width, height, rgba };
}

function seededByte(seed: Buffer, index: number): number {
    const block = Math.floor(index / 32);
    const offset = index % 32;
    return createHash("sha256").update(seed).update(String(block)).digest()[offset];
}

export function createCoverRgba(width: number, height: number, seedText: string): Buffer {
    const seed = createHash("sha256").update(seedText, "utf8").digest();
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            const base = pixel * 4;
            const noise = seededByte(seed, pixel);
            rgba[base] = 70 + ((x * 3 + noise) % 110);
            rgba[base + 1] = 86 + ((y * 4 + (noise >> 1)) % 105);
            rgba[base + 2] = 105 + (((x + y) * 2 + (noise >> 2)) % 95);
            rgba[base + 3] = 255;
        }
    }
    return rgba;
}

function packet(payload: string): Buffer {
    const payloadBytes = Buffer.from(payload, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payloadBytes.length, 0);
    return Buffer.concat([MAGIC, length, payloadBytes]);
}

function bytesToBits(bytes: Buffer): number[] {
    const bits: number[] = [];
    for (const byte of bytes) for (let shift = 7; shift >= 0; shift -= 1) bits.push((byte >> shift) & 1);
    return bits;
}

function bitsToBytes(bits: number[]): Buffer {
    const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
    for (let index = 0; index < bits.length; index += 1) bytes[Math.floor(index / 8)] |= bits[index] << (7 - (index % 8));
    return bytes;
}

export type ColorChannel = "red" | "green" | "blue";

function channelOffset(channel: ColorChannel): number {
    if (channel === "red") return 0;
    if (channel === "green") return 1;
    return 2;
}

export function embedAlphaPayload(options: { width: number; height: number; coverSeed: string; payload: string }): string {
    const rgba = createCoverRgba(options.width, options.height, options.coverSeed);
    const bits = bytesToBits(packet(options.payload));
    if (bits.length > options.width * options.height) throw new Error("The payload is too large for the configured alpha-channel capacity.");
    for (let index = 0; index < bits.length; index += 1) rgba[index * 4 + 3] = 254 | bits[index];
    return encodeRgbaPng(options.width, options.height, rgba);
}

export function extractAlphaPayload(base64Png: string): string {
    const { rgba } = decodeRgbaPng(base64Png);
    return extractFromOffsets(rgba, 3, 4);
}

export function embedColorPayload(options: { width: number; height: number; coverSeed: string; payload: string; channel: ColorChannel }): string {
    const rgba = createCoverRgba(options.width, options.height, options.coverSeed);
    const offset = channelOffset(options.channel);
    const bits = bytesToBits(packet(options.payload));
    if (bits.length > options.width * options.height) throw new Error("The payload is too large for the configured color-channel capacity.");
    for (let index = 0; index < bits.length; index += 1) rgba[index * 4 + offset] = (rgba[index * 4 + offset] & 0xfe) | bits[index];
    return encodeRgbaPng(options.width, options.height, rgba);
}

export function extractColorPayload(base64Png: string, channel: ColorChannel): string {
    const { rgba } = decodeRgbaPng(base64Png);
    return extractFromOffsets(rgba, channelOffset(channel), 4);
}

function extractFromOffsets(bytes: Buffer, offset: number, stride: number): string {
    const headerBits = (MAGIC.length + 4) * 8;
    const header = bitsToBytes(Array.from({ length: headerBits }, (_, index) => bytes[index * stride + offset] & 1));
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("PNG does not contain the expected channel payload marker.");
    const payloadLength = header.readUInt32BE(MAGIC.length);
    const totalBits = headerBits + payloadLength * 8;
    if (totalBits > Math.floor(bytes.length / stride)) throw new Error("Channel payload length exceeds image capacity.");
    const payloadBits = Array.from({ length: payloadLength * 8 }, (_, index) => bytes[(headerBits + index) * stride + offset] & 1);
    return bitsToBytes(payloadBits).toString("utf8");
}
