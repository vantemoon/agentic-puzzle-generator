import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createWavAudioArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type ReverseAudioRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type ReverseAudioSourceKind = "provided-wav" | "synthetic-voice-cue";

export interface ReverseAudioPuzzleSpec extends PuzzleGenerationSpec {
    audioDescription: string;
    recognitionLevel: ReverseAudioRecognitionLevel;
    reversalHint?: string;
    forwardAudioBase64?: string;
    acceptedAlternatives?: string[];
    sampleRate?: number;
}

const TEMPLATE_VERSION = "reverse-audio-wav-v1";
const RECOGNITION_LEVELS: readonly ReverseAudioRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const MAX_SOLUTION_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_HINT_LENGTH = 300;
const DEFAULT_SAMPLE_RATE = 8_000;
const MIN_SAMPLE_RATE = 8_000;
const MAX_SAMPLE_RATE = 48_000;
const MAX_WAV_BYTES = 2_000_000;

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizeReverseAudioMessage(input: string): string {
    return normalizeInlineText(input, "reverse-audio message", MAX_SOLUTION_LENGTH);
}

export function normalizeAudioDescription(input: string): string {
    return normalizeInlineText(input, "audio description", MAX_DESCRIPTION_LENGTH);
}

export function normalizeReversalHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "reversal hint", MAX_HINT_LENGTH);
}

export function normalizeReverseAudioRecognitionLevel(input: string): ReverseAudioRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as ReverseAudioRecognitionLevel)) {
        throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    }
    return input as ReverseAudioRecognitionLevel;
}

function normalizeSampleRate(input: number | undefined): number {
    const value = input ?? DEFAULT_SAMPLE_RATE;
    if (!Number.isInteger(value) || value < MIN_SAMPLE_RATE || value > MAX_SAMPLE_RATE) {
        throw new Error(`The sample rate must be an integer from ${MIN_SAMPLE_RATE} to ${MAX_SAMPLE_RATE}.`);
    }
    return value;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeReverseAudioMessage))];
    return normalized.length > 0 ? normalized : undefined;
}

function assertRecognitionHintPolicy(recognitionLevel: ReverseAudioRecognitionLevel, reversalHint: string | undefined): void {
    if (recognitionLevel === "explicit" && reversalHint === undefined) {
        throw new Error("Explicit reverse-audio puzzles require a reversal hint.");
    }
    if (recognitionLevel === "hidden" && reversalHint !== undefined) {
        throw new Error("Hidden reverse-audio puzzles must not include a reversal hint.");
    }
}

function assertMessageNotLeaked(options: { message: string; audioDescription: string; reversalHint?: string }): void {
    const publicText = [options.audioDescription, options.reversalHint ?? ""].join("\n");
    if (publicText.includes(options.message)) {
        throw new Error("The reverse-audio message must not appear in visible public text.");
    }
}

interface PcmWav {
    sampleRate: number;
    channels: number;
    bitsPerSample: 16;
    samples: Int16Array;
}

function assertRawBase64Wav(data: string): Buffer {
    if (data.startsWith("data:")) throw new Error("WAV audio must be raw base64 data, not a data URL.");
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("WAV audio must use valid base64 data.");
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_WAV_BYTES) throw new Error(`WAV audio must not exceed ${MAX_WAV_BYTES} bytes.`);
    return bytes;
}

export function decodePcm16Wav(base64Wav: string): PcmWav {
    const bytes = assertRawBase64Wav(base64Wav);
    if (bytes.length < 44 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
        throw new Error("Expected RIFF/WAVE audio data.");
    }

    let offset = 12;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let audioFormat = 0;
    let dataChunk: Buffer | undefined;
    while (offset + 8 <= bytes.length) {
        const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
        const chunkSize = bytes.readUInt32LE(offset + 4);
        const chunkDataStart = offset + 8;
        const chunkDataEnd = chunkDataStart + chunkSize;
        if (chunkDataEnd > bytes.length) throw new Error("Invalid WAV chunk length.");
        const chunk = bytes.subarray(chunkDataStart, chunkDataEnd);
        if (chunkId === "fmt ") {
            audioFormat = chunk.readUInt16LE(0);
            channels = chunk.readUInt16LE(2);
            sampleRate = chunk.readUInt32LE(4);
            bitsPerSample = chunk.readUInt16LE(14);
        } else if (chunkId === "data") {
            dataChunk = chunk;
        }
        offset = chunkDataEnd + (chunkSize % 2);
    }

    if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || channels > 2 || dataChunk === undefined) {
        throw new Error("Only 16-bit PCM mono or stereo WAV audio is supported.");
    }
    if (dataChunk.length % 2 !== 0) throw new Error("Invalid PCM16 sample data length.");

    const samples = new Int16Array(dataChunk.length / 2);
    for (let index = 0; index < samples.length; index += 1) samples[index] = dataChunk.readInt16LE(index * 2);
    return { sampleRate, channels, bitsPerSample: 16, samples };
}

export function encodePcm16Wav(wav: PcmWav): string {
    const dataSize = wav.samples.length * 2;
    const bytes = Buffer.alloc(44 + dataSize);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(36 + dataSize, 4);
    bytes.write("WAVE", 8, "ascii");
    bytes.write("fmt ", 12, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(wav.channels, 22);
    bytes.writeUInt32LE(wav.sampleRate, 24);
    bytes.writeUInt32LE(wav.sampleRate * wav.channels * 2, 28);
    bytes.writeUInt16LE(wav.channels * 2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < wav.samples.length; index += 1) bytes.writeInt16LE(wav.samples[index], 44 + index * 2);
    return bytes.toString("base64");
}

export function reversePcm16Wav(base64Wav: string): string {
    const wav = decodePcm16Wav(base64Wav);
    const frames = wav.samples.length / wav.channels;
    const reversed = new Int16Array(wav.samples.length);
    for (let frame = 0; frame < frames; frame += 1) {
        const sourceFrame = frames - 1 - frame;
        for (let channel = 0; channel < wav.channels; channel += 1) {
            reversed[frame * wav.channels + channel] = wav.samples[sourceFrame * wav.channels + channel];
        }
    }
    return encodePcm16Wav({ ...wav, samples: reversed });
}

export function buildSyntheticForwardAudio(message: string, sampleRate = DEFAULT_SAMPLE_RATE): string {
    const normalized = message.toUpperCase();
    const samples: number[] = [];
    const appendSine = (frequency: number, durationSeconds: number, amplitude: number): void => {
        const count = Math.floor(sampleRate * durationSeconds);
        for (let index = 0; index < count; index += 1) {
            const envelope = Math.sin(Math.PI * index / Math.max(1, count - 1));
            samples.push(Math.round(Math.sin(2 * Math.PI * frequency * (index / sampleRate)) * amplitude * envelope));
        }
    };
    const appendSilence = (durationSeconds: number): void => {
        const count = Math.floor(sampleRate * durationSeconds);
        for (let index = 0; index < count; index += 1) samples.push(0);
    };

    appendSine(520, 0.12, 7_000);
    appendSilence(0.04);
    for (const character of normalized) {
        if (character === " ") {
            appendSilence(0.16);
            continue;
        }
        const code = character.charCodeAt(0);
        const frequency = 320 + (code % 48) * 17;
        appendSine(frequency, 0.09, 8_000);
        appendSilence(0.035);
    }
    appendSine(390, 0.12, 7_000);

    return encodePcm16Wav({ sampleRate, channels: 1, bitsPerSample: 16, samples: Int16Array.from(samples) });
}

export function createReverseAudioPuzzle(spec: ReverseAudioPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");

    const message = normalizeReverseAudioMessage(spec.intendedSolution);
    const audioDescription = normalizeAudioDescription(spec.audioDescription);
    const recognitionLevel = normalizeReverseAudioRecognitionLevel(spec.recognitionLevel);
    const reversalHint = normalizeReversalHint(spec.reversalHint);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    const sampleRate = normalizeSampleRate(spec.sampleRate);

    assertRecognitionHintPolicy(recognitionLevel, reversalHint);
    assertMessageNotLeaked({ message, audioDescription, reversalHint });

    const sourceKind: ReverseAudioSourceKind = spec.forwardAudioBase64 === undefined ? "synthetic-voice-cue" : "provided-wav";
    const suppliedForwardAudio = spec.forwardAudioBase64 === undefined
        ? buildSyntheticForwardAudio(message, sampleRate)
        : spec.forwardAudioBase64;
    const forwardWav = decodePcm16Wav(suppliedForwardAudio);
    const forwardAudio = encodePcm16Wav(forwardWav);
    const reversedAudio = reversePcm16Wav(forwardAudio);
    const roundTripAudio = reversePcm16Wav(reversedAudio);
    if (roundTripAudio !== forwardAudio) throw new Error("Internal validation failed: WAV reversal did not round trip.");

    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: message, normalization }
        : { valueType: "text" as const, canonical: message, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "reversed_audio",
            valueType: "wav-audio",
            description: "A WAV audio artifact whose waveform must be reversed to recover the hidden message.",
            required: true,
            constraints: { mediaType: "audio/wav", encoding: "base64", transformation: "waveform-reversal" },
            value: { audioDescription, sourceKind }
        },
        {
            key: "hidden_message",
            valueType: "spoken-or-recognizable-audio-message",
            description: "The message recoverable after reversing the WAV waveform.",
            required: true,
            value: message
        }
    ];
    if (reversalHint !== undefined) {
        inputs.push({
            key: "reversal_hint",
            valueType: "visible-text-hint",
            description: "Visible hint that suggests reversing the waveform.",
            required: false,
            constraints: { maximumCharacters: MAX_HINT_LENGTH },
            value: reversalHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "reverse-audio",
        inputs,
        outputs: [{
            key: "recovered_message",
            valueType: "plain-text",
            description: "The message recovered by reversing and interpreting the audio.",
            value: message
        }],
        artifact: createWavAudioArtifact(reversedAudio),
        prompt: reversalHint === undefined
            ? `Listen to the WAV audio artifact (${audioDescription}) and recover the hidden message.`
            : `Listen to the WAV audio artifact (${audioDescription}). ${reversalHint}`,
        solution,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            reverseAudio: {
                templateVersion: TEMPLATE_VERSION,
                transform: "waveform-reversal",
                recognitionLevel,
                mediaType: "audio/wav",
                encoding: "base64",
                sourceKind,
                hasReversalHint: reversalHint !== undefined,
                artifactSha256: createHash("sha256").update(Buffer.from(reversedAudio, "base64")).digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
