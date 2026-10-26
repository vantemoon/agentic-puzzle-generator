import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface NthCharacterPuzzleSpec extends PuzzleGenerationSpec {
    carrierText: string;
    genre: string;
    step: number;
    startIndex: number;
}

const MAX_SOLUTION_LENGTH = 120;
const MAX_CARRIER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const MIN_STEP = 8;
const MAX_STEP = 50;
const RULE_VERSION = "ascii-letter-periodic-v2";
const ASCII_LETTER = /[A-Za-z]/;

export function normalizeNthCharacterSolution(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();

    if (normalized.length === 0) {
        throw new Error("The intended solution must not be empty.");
    }
    if ([...normalized].length > MAX_SOLUTION_LENGTH) {
        throw new Error(
            `The intended solution must not exceed ${MAX_SOLUTION_LENGTH} characters.`
        );
    }
    if (!/^[A-Z ]+$/.test(normalized)) {
        throw new Error("The intended solution may contain only English letters and spaces.");
    }

    return normalized;
}

export function normalizeNthCharacterCarrier(input: string): string {
    const normalized = input.replace(/\r\n?/g, "\n").trim();

    if (normalized.length === 0) {
        throw new Error("The carrier text must not be empty.");
    }
    if ([...normalized].length > MAX_CARRIER_TEXT_LENGTH) {
        throw new Error(
            `The carrier text must not exceed ${MAX_CARRIER_TEXT_LENGTH} Unicode code points.`
        );
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(normalized)) {
        throw new Error("The carrier text must not contain unsupported control characters.");
    }

    return normalized;
}

export function normalizeNthCharacterGenre(input: string): string {
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

export function validateNthCharacterRule(step: number, startIndex: number): void {
    if (!Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
        throw new Error(`The step must be an integer from ${MIN_STEP} to ${MAX_STEP}.`);
    }
    if (!Number.isInteger(startIndex) || startIndex < 1 || startIndex > step) {
        throw new Error("The start index must be an integer from 1 through the step.");
    }
}

export function extractNthCharacters(
    sourceInput: string,
    step: number,
    startIndex: number,
    count: number
): string {
    const source = normalizeNthCharacterCarrier(sourceInput);
    validateNthCharacterRule(step, startIndex);

    if (!Number.isInteger(count) || count < 1) {
        throw new Error("The extraction count must be a positive integer.");
    }

    const letters = [...source].filter((character) => ASCII_LETTER.test(character));
    const finalIndex = startIndex + (count - 1) * step;
    if (finalIndex > letters.length) {
        throw new Error(
            `The carrier has ${letters.length} ASCII letters, but extraction `
            + `requires letter ${finalIndex}.`
        );
    }

    return Array.from(
        { length: count },
        (_, index) => letters[startIndex - 1 + index * step]
    ).join("");
}

function selectedSourceOffsets(
    source: string,
    step: number,
    startIndex: number,
    count: number
): number[] {
    const selectedLetterIndices = new Set(Array.from(
        { length: count },
        (_, index) => startIndex - 1 + index * step
    ));
    const offsets: number[] = [];
    let letterIndex = 0;

    for (const [sourceOffset, character] of [...source].entries()) {
        if (!ASCII_LETTER.test(character)) continue;
        if (selectedLetterIndices.has(letterIndex)) offsets.push(sourceOffset);
        letterIndex += 1;
    }

    return offsets;
}

function containsVisibleSolution(carrierText: string, solution: string): boolean {
    if (solution.length < 4) return false;
    return carrierText.replace(/\s+/g, " ").toUpperCase().includes(solution.toUpperCase());
}

export function validateNthCharacterCarrier(
    intendedSolution: string,
    carrierInput: string,
    step: number,
    startIndex: number
): string {
    const solution = normalizeNthCharacterSolution(intendedSolution);
    const carrierText = normalizeNthCharacterCarrier(carrierInput);
    const targetLetters = solution.replaceAll(" ", "");

    if (containsVisibleSolution(carrierText, solution)) {
        throw new Error("The intended solution must not appear contiguously in the carrier text.");
    }

    const extracted = extractNthCharacters(
        carrierText,
        step,
        startIndex,
        targetLetters.length
    );
    if (extracted.toUpperCase() !== targetLetters) {
        throw new Error(
            `The periodic character extraction produces ${JSON.stringify(extracted)}, not `
            + `the intended solution letters ${JSON.stringify(targetLetters)}.`
        );
    }

    return carrierText;
}

export function createNthCharacterPuzzle(
    spec: NthCharacterPuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeNthCharacterSolution(spec.intendedSolution);
    const genre = normalizeNthCharacterGenre(spec.genre);
    validateNthCharacterRule(spec.step, spec.startIndex);
    const carrierText = validateNthCharacterCarrier(
        solution,
        spec.carrierText,
        spec.step,
        spec.startIndex
    );
    const targetLetters = solution.replaceAll(" ", "");
    const selectionCount = targetLetters.length;
    const extractedLetters = extractNthCharacters(
        carrierText,
        spec.step,
        spec.startIndex,
        selectionCount
    ).toUpperCase();
    const selectedLetterIndices = Array.from(
        { length: selectionCount },
        (_, index) => spec.startIndex - 1 + index * spec.step
    );
    const selectedCodePointOffsets = selectedSourceOffsets(
        carrierText,
        spec.step,
        spec.startIndex,
        selectionCount
    );
    const wordLengths = solution.split(" ").map((word) => word.length);
    const artifactHash = createHash("sha256").update(carrierText, "utf8").digest("hex");
    const instruction = [
        "Count only ASCII letters from A to Z, ignoring case.",
        "Ignore spaces, punctuation, digits, and line breaks.",
        `Begin with letter ${spec.startIndex}, take every ${spec.step}${ordinalSuffix(spec.step)} letter,`,
        `and stop after ${selectionCount} selected letters; later text is not part of the extraction.`,
        `Group the result using word lengths ${wordLengths.join("-")}.`
    ].join(" ");
    const prompt = [instruction, carrierText].join("\n\n");
    const extractionRule = {
        unit: "ascii-letter",
        indexOrigin: 1,
        step: spec.step,
        startIndex: spec.startIndex,
        selectionCount,
        caseBehavior: "ignored",
        whitespaceBehavior: "ignored",
        punctuationBehavior: "ignored",
        digitBehavior: "ignored",
        lineEndingNormalization: "crlf-and-cr-to-lf",
        ruleVersion: RULE_VERSION
    } as const;

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "periodic-letter-extraction",
        inputs: [
            {
                key: "carrier_text",
                valueType: "periodic-character-carrier-text",
                description: "The text whose ASCII letters participate in periodic extraction.",
                required: true,
                constraints: {
                    genre,
                    maximumCodePoints: MAX_CARRIER_TEXT_LENGTH,
                    ignoredCharacters: "non-ascii-letters"
                },
                value: carrierText
            },
            {
                key: "extraction_rule",
                valueType: "periodic-letter-extraction-rule",
                description: "The one-based start, step, count, and ASCII-letter convention.",
                required: true,
                constraints: {
                    minimumStep: MIN_STEP,
                    maximumStep: MAX_STEP,
                    ruleVersion: RULE_VERSION
                },
                value: extractionRule
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered from the periodic ASCII-letter positions.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: carrierText },
        prompt,
        solution: {
            valueType: "text",
            canonical: solution,
            normalization: ["trim", "case-insensitive", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: true, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            nthCharacter: {
                genre,
                ...extractionRule,
                wordLengths,
                selectedLetterIndices,
                selectedCodePointOffsets,
                extractedLetters,
                artifactSha256: artifactHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (extractedLetters !== targetLetters) {
        throw new Error(
            "Internal validation failed: periodic letter extraction did not recover the solution."
        );
    }

    return puzzle;
}

function ordinalSuffix(value: number): string {
    const modulo100 = value % 100;
    if (modulo100 >= 11 && modulo100 <= 13) return "th";
    switch (value % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}
