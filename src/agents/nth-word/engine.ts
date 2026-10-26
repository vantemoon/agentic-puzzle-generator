import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface NthWordPuzzleSpec extends PuzzleGenerationSpec {
    coverText: string;
    genre: string;
    step: number;
    startIndex: number;
}

interface IndexedWord {
    index: number;
    source: string;
    normalized: string;
}

const MAX_SOLUTION_LENGTH = 120;
const MAX_SOLUTION_WORDS = 20;
const MAX_COVER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const MIN_COVER_WORDS = 30;
const MIN_STEP = 4;
const MAX_STEP = 30;
const TOKENIZER_VERSION = "ascii-words-apostrophes-v1";
const RULE_VERSION = "periodic-word-index-v1";
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function normalizeNthWordPhrase(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();

    if (normalized.length === 0) {
        throw new Error("The intended solution must not be empty.");
    }
    if (normalized.length > MAX_SOLUTION_LENGTH) {
        throw new Error(
            `The intended solution must not exceed ${MAX_SOLUTION_LENGTH} characters.`
        );
    }
    if (!/^[A-Z ]+$/.test(normalized)) {
        throw new Error("The intended solution may contain only English letters and spaces.");
    }
    if (normalized.split(" ").length > MAX_SOLUTION_WORDS) {
        throw new Error(
            `The intended solution must not exceed ${MAX_SOLUTION_WORDS} words.`
        );
    }

    return normalized;
}

export function normalizeNthWordCover(input: string): string {
    const normalized = input.replace(/\r\n?/g, "\n").trim();

    if (normalized.length === 0) {
        throw new Error("The cover text must not be empty.");
    }
    if (normalized.length > MAX_COVER_TEXT_LENGTH) {
        throw new Error(
            `The cover text must not exceed ${MAX_COVER_TEXT_LENGTH} characters.`
        );
    }
    if (/[^\x09\x0A\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            "The cover text may contain printable ASCII, tabs, line breaks, and common typographic punctuation."
        );
    }

    return normalized;
}

export function normalizeNthWordGenre(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
        throw new Error("The cover-text genre must not be empty.");
    }
    if (normalized.length > MAX_GENRE_LENGTH) {
        throw new Error(`The cover-text genre must not exceed ${MAX_GENRE_LENGTH} characters.`);
    }
    if (/[\u0000-\u001F\u007F-\u009F]/.test(normalized)) {
        throw new Error("The cover-text genre must not contain control characters.");
    }

    return normalized;
}

export function tokenizeNthWordCover(input: string): IndexedWord[] {
    const coverText = normalizeNthWordCover(input);
    const matches = coverText.match(WORD_PATTERN) ?? [];

    return matches.map((source, position) => ({
        index: position + 1,
        source,
        normalized: source.toUpperCase()
    }));
}

export function validateNthWordRule(step: number, startIndex: number): void {
    if (!Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
        throw new Error(`The step must be an integer from ${MIN_STEP} to ${MAX_STEP}.`);
    }
    if (!Number.isInteger(startIndex) || startIndex < 1 || startIndex > step) {
        throw new Error("The start index must be an integer from 1 through the step.");
    }
}

export function extractNthWords(
    coverInput: string,
    step: number,
    startIndex: number,
    count: number
): string {
    const tokens = tokenizeNthWordCover(coverInput);
    validateNthWordRule(step, startIndex);

    if (!Number.isInteger(count) || count < 1) {
        throw new Error("The extraction count must be a positive integer.");
    }

    const finalIndex = startIndex + (count - 1) * step;
    if (finalIndex > tokens.length) {
        throw new Error(
            `The cover text has ${tokens.length} words, but extraction requires word ${finalIndex}.`
        );
    }

    return Array.from(
        { length: count },
        (_, index) => tokens[startIndex - 1 + index * step].normalized
    ).join(" ");
}

function containsContiguousSolution(tokens: IndexedWord[], solutionWords: string[]): boolean {
    if (solutionWords.length < 2) return false;
    return tokens.some((_, start) => solutionWords.every(
        (word, offset) => tokens[start + offset]?.normalized === word
    ));
}

export function validateNthWordCover(
    intendedSolution: string,
    coverInput: string,
    step: number,
    startIndex: number
): string {
    const solution = normalizeNthWordPhrase(intendedSolution);
    const coverText = normalizeNthWordCover(coverInput);
    const tokens = tokenizeNthWordCover(coverText);
    const solutionWords = solution.split(" ");

    validateNthWordRule(step, startIndex);
    if (tokens.length < MIN_COVER_WORDS) {
        throw new Error(`The cover text must contain at least ${MIN_COVER_WORDS} words.`);
    }
    if (containsContiguousSolution(tokens, solutionWords)) {
        throw new Error("The intended solution must not appear contiguously in the cover text.");
    }

    const extracted = extractNthWords(coverText, step, startIndex, solutionWords.length);
    if (extracted !== solution) {
        throw new Error(
            `The periodic word extraction produces ${JSON.stringify(extracted)}, not `
            + `the intended solution ${JSON.stringify(solution)}.`
        );
    }

    return coverText;
}

export function createNthWordPuzzle(spec: NthWordPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeNthWordPhrase(spec.intendedSolution);
    const genre = normalizeNthWordGenre(spec.genre);
    validateNthWordRule(spec.step, spec.startIndex);
    const coverText = validateNthWordCover(
        solution,
        spec.coverText,
        spec.step,
        spec.startIndex
    );
    const tokens = tokenizeNthWordCover(coverText);
    const selectionCount = solution.split(" ").length;
    const selectedWordIndices = Array.from(
        { length: selectionCount },
        (_, index) => spec.startIndex + index * spec.step
    );
    const extractedMessage = extractNthWords(
        coverText,
        spec.step,
        spec.startIndex,
        selectionCount
    );
    const coverHash = createHash("sha256").update(coverText, "utf8").digest("hex");
    const instruction = [
        "Count punctuation-free words from the start using one-based positions.",
        `Begin with word ${spec.startIndex}, take every ${spec.step}${ordinalSuffix(spec.step)} word,`,
        `and stop after ${selectionCount} selected words.`
    ].join(" ");
    const prompt = [instruction, coverText].join("\n\n");
    const extractionRule = {
        unit: "ascii-word-with-apostrophes",
        indexOrigin: 1,
        step: spec.step,
        startIndex: spec.startIndex,
        selectionCount,
        tokenizerVersion: TOKENIZER_VERSION,
        ruleVersion: RULE_VERSION
    } as const;

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "periodic-word-extraction",
        inputs: [
            {
                key: "cover_text",
                valueType: "periodic-word-carrier-text",
                description: "The cohesive cover text whose words are counted from one.",
                required: true,
                constraints: {
                    genre,
                    tokenizerVersion: TOKENIZER_VERSION,
                    maximumCharacters: MAX_COVER_TEXT_LENGTH,
                    minimumWords: MIN_COVER_WORDS
                },
                value: coverText
            },
            {
                key: "extraction_rule",
                valueType: "periodic-word-extraction-rule",
                description: "The one-based start, step, count, and tokenization convention.",
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
            description: "The plaintext recovered from the periodic word positions.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: coverText },
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
            nthWord: {
                genre,
                ...extractionRule,
                tokenPattern: WORD_PATTERN.source,
                wordCount: tokens.length,
                selectedWordIndices,
                selectedTokens: selectedWordIndices.map(
                    (index) => tokens[index - 1].normalized
                ),
                extractedMessage,
                coverTextSha256: coverHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (extractedMessage !== puzzle.solution.canonical) {
        throw new Error(
            "Internal validation failed: periodic word extraction did not recover the solution."
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
