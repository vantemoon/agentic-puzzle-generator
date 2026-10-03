import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface BinaryCapitalizationPuzzleSpec extends PuzzleGenerationSpec {
    carrierText: string;
    genre: string;
}

const MAX_SOLUTION_LENGTH = 80;
const MAX_CARRIER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const BITS_PER_CHARACTER = 8;
const TERMINATOR = "00000000";
const RULE_VERSION = "ascii-letter-case-bits-v1";
const ASCII_LETTER = /[A-Za-z]/;

export function normalizeCapitalizationSolution(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
        throw new Error("The intended solution must not be empty.");
    }
    if (normalized.length > MAX_SOLUTION_LENGTH) {
        throw new Error(
            `The intended solution must not exceed ${MAX_SOLUTION_LENGTH} characters.`
        );
    }
    if (!/^[\x20-\x7E]+$/.test(normalized)) {
        throw new Error("The intended solution may contain only printable ASCII characters.");
    }

    return normalized;
}

export function normalizeCapitalizationCarrier(input: string): string {
    const normalized = input.replace(/\r\n?/g, "\n").trim();

    if (normalized.length === 0) {
        throw new Error("The carrier text must not be empty.");
    }
    if (normalized.length > MAX_CARRIER_TEXT_LENGTH) {
        throw new Error(
            `The carrier text must not exceed ${MAX_CARRIER_TEXT_LENGTH} characters.`
        );
    }
    if (/[^\x09\x0A\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            "The carrier text may contain printable ASCII, tabs, line breaks, and common typographic punctuation."
        );
    }

    return normalized;
}

export function normalizeCapitalizationGenre(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
        throw new Error("The carrier-text genre must not be empty.");
    }
    if (normalized.length > MAX_GENRE_LENGTH) {
        throw new Error(
            `The carrier-text genre must not exceed ${MAX_GENRE_LENGTH} characters.`
        );
    }
    if (/[\u0000-\u001F\u007F-\u009F]/.test(normalized)) {
        throw new Error("The carrier-text genre must not contain control characters.");
    }

    return normalized;
}

export function encodeCapitalizationBits(input: string): string {
    const solution = normalizeCapitalizationSolution(input);
    const payload = [...solution]
        .map((character) => character.charCodeAt(0).toString(2).padStart(BITS_PER_CHARACTER, "0"))
        .join("");

    return payload + TERMINATOR;
}

function asciiLetterCount(input: string): number {
    return [...input].filter((character) => ASCII_LETTER.test(character)).length;
}

function containsVisibleSolution(carrierText: string, solution: string): boolean {
    const normalizedCarrier = carrierText.replace(/\s+/g, " ").toUpperCase();
    return solution.length >= 4 && normalizedCarrier.includes(solution.toUpperCase());
}

export function applyCapitalizationPattern(carrierInput: string, solutionInput: string): string {
    const carrierText = normalizeCapitalizationCarrier(carrierInput);
    const solution = normalizeCapitalizationSolution(solutionInput);
    const bits = encodeCapitalizationBits(solution);
    const availableLetters = asciiLetterCount(carrierText);

    if (containsVisibleSolution(carrierText, solution)) {
        throw new Error("The intended solution must not appear contiguously in the carrier text.");
    }
    if (availableLetters < bits.length) {
        throw new Error(
            `The carrier text contains ${availableLetters} ASCII letters, but the encoded `
            + `solution and terminator require at least ${bits.length}.`
        );
    }

    let bitIndex = 0;
    return [...carrierText].map((character) => {
        if (!ASCII_LETTER.test(character) || bitIndex >= bits.length) {
            return character;
        }

        const bit = bits[bitIndex];
        bitIndex += 1;
        return bit === "1" ? character.toUpperCase() : character.toLowerCase();
    }).join("");
}

export function extractCapitalizationBits(source: string): string {
    return [...source]
        .filter((character) => ASCII_LETTER.test(character))
        .map((character) => character === character.toUpperCase() ? "1" : "0")
        .join("");
}

export function decodeCapitalizationPattern(source: string): string {
    const bits = extractCapitalizationBits(source);
    let decoded = "";

    for (let offset = 0; offset + BITS_PER_CHARACTER <= bits.length; offset += BITS_PER_CHARACTER) {
        const byte = bits.slice(offset, offset + BITS_PER_CHARACTER);
        const code = Number.parseInt(byte, 2);

        if (byte === TERMINATOR) {
            return decoded;
        }
        if (code < 32 || code > 126) {
            throw new Error(
                `The capitalization pattern contains non-printable ASCII byte ${byte}.`
            );
        }

        decoded += String.fromCharCode(code);
    }

    throw new Error("The capitalization pattern does not contain a complete null terminator.");
}

export function createBinaryCapitalizationPuzzle(
    spec: BinaryCapitalizationPuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeCapitalizationSolution(spec.intendedSolution);
    const carrierText = normalizeCapitalizationCarrier(spec.carrierText);
    const genre = normalizeCapitalizationGenre(spec.genre);
    const artifactSource = applyCapitalizationPattern(carrierText, solution);
    const encodedBits = encodeCapitalizationBits(solution);
    const decoded = decodeCapitalizationPattern(artifactSource);
    const artifactHash = createHash("sha256").update(artifactSource, "utf8").digest("hex");
    const instruction = [
        "Read only ASCII letters from left to right.",
        "Treat lowercase as 0 and uppercase as 1, group the bits into eight-bit ASCII bytes,",
        "and stop at the 00000000 null byte. Decode the hidden message."
    ].join(" ");
    const prompt = [instruction, artifactSource].join("\n\n");
    const extractionRule = {
        unit: "ascii-letter",
        direction: "left-to-right",
        lowercaseBit: 0,
        uppercaseBit: 1,
        bitsPerCharacter: BITS_PER_CHARACTER,
        terminator: TERMINATOR,
        nonLetterBehavior: "ignored",
        ruleVersion: RULE_VERSION
    } as const;

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "binary-capitalization-pattern",
        inputs: [
            {
                key: "carrier_text",
                valueType: "case-bit-carrier-text",
                description: "The mixed-case carrier text visible to the solver.",
                required: true,
                constraints: {
                    genre,
                    maximumCharacters: MAX_CARRIER_TEXT_LENGTH,
                    encodedLetterCount: encodedBits.length,
                    preservesLetterCase: true
                },
                value: artifactSource
            },
            {
                key: "extraction_rule",
                valueType: "capitalization-bit-rule",
                description: "The ordered mapping from ASCII letter case to binary digits.",
                required: true,
                constraints: { ruleVersion: RULE_VERSION },
                value: extractionRule
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered from the capitalization bits.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
        prompt,
        solution: {
            valueType: "text",
            canonical: solution,
            normalization: ["trim", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            capitalization: {
                genre,
                ...extractionRule,
                encodedLetterCount: encodedBits.length,
                carrierLetterCount: asciiLetterCount(artifactSource),
                decodedMessage: decoded,
                artifactSha256: artifactHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decoded !== puzzle.solution.canonical) {
        throw new Error(
            "Internal validation failed: the capitalization pattern did not recover the intended solution."
        );
    }

    return puzzle;
}
