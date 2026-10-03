import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createWavAudioArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { decodeMorse, encodeMorse, normalizePhrase } from "../morse/engine.js";
import { decodePcm16Wav, encodePcm16Wav } from "../reverse-audio/engine.js";

export type MorseAudioRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type MorseAudioToneStyle = "radio-beep" | "soft-pulse" | "musical-note";

export interface MorseAudioPuzzleSpec extends PuzzleGenerationSpec {
    audioDescription: string;
    recognitionLevel: MorseAudioRecognitionLevel;
    morseAudioHint?: string;
    toneStyle?: MorseAudioToneStyle;
    sampleRate?: number;
    unitDurationMs?: number;
    toneFrequencyHz?: number;
    acceptedAlternatives?: string[];
}

const TEMPLATE_VERSION = "morse-audio-wav-v1";
const RECOGNITION_LEVELS: readonly MorseAudioRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const TONE_STYLES: readonly MorseAudioToneStyle[] = ["radio-beep", "soft-pulse", "musical-note"];
const DEFAULT_SAMPLE_RATE = 8_000;
const DEFAULT_UNIT_MS = 90;
const DEFAULT_FREQUENCY = 700;
const MIN_SAMPLE_RATE = 8_000;
const MAX_SAMPLE_RATE = 48_000;
const MIN_UNIT_MS = 40;
const MAX_UNIT_MS = 250;
const MIN_FREQUENCY = 220;
const MAX_FREQUENCY = 1_600;

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizeMorseAudioMessage(input: string): string {
    return normalizePhrase(input);
}

export function normalizeMorseAudioDescription(input: string): string {
    return normalizeInlineText(input, "audio description", 500);
}

export function normalizeMorseAudioHint(input: string | undefined): string | undefined {
    return input === undefined ? undefined : normalizeInlineText(input, "Morse-audio hint", 300);
}

export function normalizeMorseAudioRecognitionLevel(input: string): MorseAudioRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as MorseAudioRecognitionLevel)) throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    return input as MorseAudioRecognitionLevel;
}

export function normalizeMorseAudioToneStyle(input: string | undefined): MorseAudioToneStyle {
    const value = input ?? "radio-beep";
    if (!TONE_STYLES.includes(value as MorseAudioToneStyle)) throw new Error(`The tone style must be one of: ${TONE_STYLES.join(", ")}.`);
    return value as MorseAudioToneStyle;
}

function integerInRange(input: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
    const value = input ?? fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`The ${name} must be an integer from ${minimum} to ${maximum}.`);
    return value;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeMorseAudioMessage))];
    return normalized.length > 0 ? normalized : undefined;
}

function assertHintPolicy(recognitionLevel: MorseAudioRecognitionLevel, hint: string | undefined): void {
    if (recognitionLevel === "explicit" && hint === undefined) throw new Error("Explicit Morse-audio puzzles require a Morse-audio hint.");
    if (recognitionLevel === "hidden" && hint !== undefined) throw new Error("Hidden Morse-audio puzzles must not include a Morse-audio hint.");
}

function assertMessageNotLeaked(options: { message: string; audioDescription: string; hint?: string }): void {
    if ([options.audioDescription.toUpperCase(), options.hint?.toUpperCase() ?? ""].join("\n").includes(options.message)) {
        throw new Error("The Morse-audio message must not appear in visible public text.");
    }
}

function amplitudeForStyle(style: MorseAudioToneStyle): number {
    if (style === "soft-pulse") return 5_500;
    if (style === "musical-note") return 8_500;
    return 9_000;
}

export function buildMorseAudio(options: { morse: string; sampleRate?: number; unitDurationMs?: number; toneFrequencyHz?: number; toneStyle?: MorseAudioToneStyle }): string {
    const sampleRate = integerInRange(options.sampleRate, DEFAULT_SAMPLE_RATE, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE, "sample rate");
    const unitDurationMs = integerInRange(options.unitDurationMs, DEFAULT_UNIT_MS, MIN_UNIT_MS, MAX_UNIT_MS, "unit duration");
    const toneFrequencyHz = integerInRange(options.toneFrequencyHz, DEFAULT_FREQUENCY, MIN_FREQUENCY, MAX_FREQUENCY, "tone frequency");
    const toneStyle = normalizeMorseAudioToneStyle(options.toneStyle);
    const unitSamples = Math.round(sampleRate * unitDurationMs / 1_000);
    const samples: number[] = [];
    const amplitude = amplitudeForStyle(toneStyle);

    const appendSilenceUnits = (units: number): void => {
        for (let index = 0; index < unitSamples * units; index += 1) samples.push(0);
    };
    const appendToneUnits = (units: number): void => {
        const count = unitSamples * units;
        for (let index = 0; index < count; index += 1) {
            const t = index / sampleRate;
            const envelope = Math.sin(Math.PI * index / Math.max(1, count - 1));
            const harmonic = toneStyle === "musical-note" ? 0.18 * Math.sin(2 * Math.PI * toneFrequencyHz * 2 * t) : 0;
            samples.push(Math.round((Math.sin(2 * Math.PI * toneFrequencyHz * t) + harmonic) * amplitude * envelope));
        }
    };

    appendSilenceUnits(3);
    const words = options.morse.split(" / ");
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        const letters = words[wordIndex].split(" ").filter(Boolean);
        for (let letterIndex = 0; letterIndex < letters.length; letterIndex += 1) {
            const symbols = [...letters[letterIndex]];
            for (let symbolIndex = 0; symbolIndex < symbols.length; symbolIndex += 1) {
                appendToneUnits(symbols[symbolIndex] === "." ? 1 : 3);
                if (symbolIndex < symbols.length - 1) appendSilenceUnits(1);
            }
            if (letterIndex < letters.length - 1) appendSilenceUnits(3);
        }
        if (wordIndex < words.length - 1) appendSilenceUnits(7);
    }
    appendSilenceUnits(3);

    return encodePcm16Wav({ sampleRate, channels: 1, bitsPerSample: 16, samples: Int16Array.from(samples) });
}

export function extractMorsePatternFromAudio(base64Wav: string, unitDurationMs: number): string {
    const wav = decodePcm16Wav(base64Wav);
    if (wav.channels !== 1) throw new Error("Morse-audio extraction expects mono WAV audio.");
    const unitSamples = Math.round(wav.sampleRate * unitDurationMs / 1_000);
    const units: boolean[] = [];
    for (let offset = 0; offset + unitSamples <= wav.samples.length; offset += unitSamples) {
        let peak = 0;
        for (let index = 0; index < unitSamples; index += 1) peak = Math.max(peak, Math.abs(wav.samples[offset + index]));
        units.push(peak > 1_000);
    }
    while (units.length > 0 && !units[0]) units.shift();
    while (units.length > 0 && !units[units.length - 1]) units.pop();

    const tokens: string[] = [];
    let runValue = units[0];
    let runLength = 0;
    const flush = (): void => {
        if (runLength === 0) return;
        if (runValue) tokens.push(runLength >= 2 ? "-" : ".");
        else if (runLength >= 6) tokens.push("/");
        else if (runLength >= 2) tokens.push(" ");
    };
    for (const value of units) {
        if (value === runValue) runLength += 1;
        else {
            flush();
            runValue = value;
            runLength = 1;
        }
    }
    flush();
    return tokens.join("").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
}

export function createMorseAudioPuzzle(spec: MorseAudioPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");
    const message = normalizeMorseAudioMessage(spec.intendedSolution);
    const audioDescription = normalizeMorseAudioDescription(spec.audioDescription);
    const recognitionLevel = normalizeMorseAudioRecognitionLevel(spec.recognitionLevel);
    const morseAudioHint = normalizeMorseAudioHint(spec.morseAudioHint);
    const toneStyle = normalizeMorseAudioToneStyle(spec.toneStyle);
    const sampleRate = integerInRange(spec.sampleRate, DEFAULT_SAMPLE_RATE, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE, "sample rate");
    const unitDurationMs = integerInRange(spec.unitDurationMs, DEFAULT_UNIT_MS, MIN_UNIT_MS, MAX_UNIT_MS, "unit duration");
    const toneFrequencyHz = integerInRange(spec.toneFrequencyHz, DEFAULT_FREQUENCY, MIN_FREQUENCY, MAX_FREQUENCY, "tone frequency");
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    assertHintPolicy(recognitionLevel, morseAudioHint);
    assertMessageNotLeaked({ message, audioDescription, hint: morseAudioHint });

    const morse = encodeMorse(message);
    const audio = buildMorseAudio({ morse, sampleRate, unitDurationMs, toneFrequencyHz, toneStyle });
    const extractedPattern = extractMorsePatternFromAudio(audio, unitDurationMs);
    if (extractedPattern !== morse || decodeMorse(extractedPattern) !== message) throw new Error("Internal validation failed: Morse-audio decoding did not recover the answer.");

    const normalization: Array<"trim" | "case-insensitive" | "collapse-whitespace"> = ["trim", "case-insensitive", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: message, normalization }
        : { valueType: "text" as const, canonical: message, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        { key: "morse_audio", valueType: "wav-audio", description: "A WAV audio artifact whose tones encode Morse-code dots and dashes.", required: true, constraints: { mediaType: "audio/wav", encoding: "base64", sampleRate, unitDurationMs, toneFrequencyHz, toneStyle }, value: { audioDescription, morse } },
        { key: "hidden_message", valueType: "morse-audio-message", description: "The message encoded in the audio Morse tones.", required: true, value: message }
    ];
    if (morseAudioHint !== undefined) inputs.push({ key: "morse_audio_hint", valueType: "visible-text-hint", description: "Visible hint suggesting Morse-code audio interpretation.", required: false, value: morseAudioHint });

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "morse-audio",
        inputs,
        outputs: [{ key: "decoded_message", valueType: "plain-text", description: "The message recovered by interpreting the tones as Morse code.", value: message }],
        artifact: createWavAudioArtifact(audio),
        prompt: morseAudioHint === undefined ? `Listen to the WAV audio artifact (${audioDescription}) and recover the hidden message.` : `Listen to the WAV audio artifact (${audioDescription}). ${morseAudioHint}`,
        solution,
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: true, collapseWhitespace: true } },
        externalKnowledge: { required: false },
        extensions: { morseAudio: { templateVersion: TEMPLATE_VERSION, encoding: "morse-tones", recognitionLevel, mediaType: "audio/wav", audioEncoding: "base64", toneStyle, sampleRate, unitDurationMs, toneFrequencyHz, artifactSha256: createHash("sha256").update(Buffer.from(audio, "base64")).digest("hex") } }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
