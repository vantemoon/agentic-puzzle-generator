import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface AcrosticPuzzleSpec extends PuzzleGenerationSpec {
    coverText: string;
    genre: string;
}

const MAX_SOLUTION_LENGTH = 120;
const MAX_COVER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const MIN_WORDS_PER_LINE = 3;
const MIN_PLAIN_WRAP_RATIO = 0.3;
const RULE_VERSION = "line-initial-ascii-v2";
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function normalizeAcrosticPhrase(input: string): string {
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

    return normalized;
}

export function normalizeAcrosticGenre(input: string): string {
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

export function normalizeAcrosticCoverText(input: string): string {
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

function wordsInLine(line: string): string[] {
    return line.match(WORD_PATTERN) ?? [];
}

export function extractAcrostic(input: string): string {
    const coverText = normalizeAcrosticCoverText(input);
    let extracted = "";

    for (const line of coverText.split("\n")) {
        if (line.trim().length === 0) {
            continue;
        }

        const initial = line.match(/[A-Za-z]/)?.[0];
        if (initial === undefined) {
            throw new Error("Every nonblank carrier line must contain an ASCII letter.");
        }
        if (wordsInLine(line).length < MIN_WORDS_PER_LINE) {
            throw new Error(
                `Every nonblank carrier line must contain at least ${MIN_WORDS_PER_LINE} words.`
            );
        }
        extracted += initial.toUpperCase();
    }

    if (extracted.length === 0) {
        throw new Error("The cover text must contain at least one carrier line.");
    }
    return extracted;
}

function containsVisibleSolution(coverText: string, answer: string): boolean {
    const coverWords = coverText.match(WORD_PATTERN)?.map((word) => word.toUpperCase()) ?? [];
    const answerWords = answer.split(" ");

    return coverWords.some((_, start) => answerWords.every(
        (word, offset) => coverWords[start + offset] === word
    ));
}

function validateNaturalLineFlow(coverText: string): void {
    const lines = coverText.split("\n");
    const carrierLines = lines.filter((line) => line.trim().length > 0);
    let previousLine: string | undefined;
    let plainWraps = 0;

    for (const line of lines) {
        if (line.trim().length === 0) {
            previousLine = undefined;
            continue;
        }

        if (previousLine !== undefined) {
            const previousEndsSentence = /[.!?]["'’”)]*$/.test(previousLine.trimEnd());
            const previousEndsWithPunctuation = /[.!?,;:–—]["'’”)]*$/.test(
                previousLine.trimEnd()
            );
            const initial = line.match(/[A-Za-z]/)?.[0];

            if (!previousEndsSentence && initial !== undefined && initial !== initial.toLowerCase()) {
                throw new Error(
                    "A line continuing the previous sentence must use normal lowercase "
                    + "capitalization; do not capitalize carrier lines solely for the acrostic."
                );
            }
            if (!previousEndsWithPunctuation) {
                plainWraps += 1;
            }
        }

        previousLine = line;
    }

    if (carrierLines.length >= 3) {
        const requiredPlainWraps = Math.max(
            1,
            Math.ceil((carrierLines.length - 1) * MIN_PLAIN_WRAP_RATIO)
        );
        if (plainWraps < requiredPlainWraps) {
            throw new Error(
                `The cover text needs at least ${requiredPlainWraps} natural mid-sentence `
                + "line break(s) without punctuation at the preceding line end."
            );
        }
    }
}

export function validateAcrosticCover(intendedSolution: string, input: string): string {
    const answer = normalizeAcrosticPhrase(intendedSolution);
    const coverText = normalizeAcrosticCoverText(input);
    const extracted = extractAcrostic(coverText);
    const expectedLetters = answer.replaceAll(" ", "");

    if (extracted !== expectedLetters) {
        throw new Error(
            `The cover text extracts to "${extracted}", not the intended solution letters `
            + `"${expectedLetters}".`
        );
    }
    if (containsVisibleSolution(coverText, answer)) {
        throw new Error("The intended solution must not appear contiguously in the cover text.");
    }
    validateNaturalLineFlow(coverText);

    return answer;
}

export function createAcrosticPuzzle(spec: AcrosticPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeAcrosticPhrase(spec.intendedSolution);
    const coverText = normalizeAcrosticCoverText(spec.coverText);
    const genre = normalizeAcrosticGenre(spec.genre);
    const validatedMessage = validateAcrosticCover(answer, coverText);
    const extractedLetters = extractAcrostic(coverText);
    const wordLengths = answer.split(" ").map((word) => word.length);
    const sourceHash = createHash("sha256").update(coverText, "utf8").digest("hex");
    const extractionRule = {
        unit: "line",
        character: "first-ascii-letter",
        direction: "top-to-bottom",
        blankLineBehavior: "ignored",
        wordLengths,
        ruleVersion: RULE_VERSION
    } as const;
    const instruction = [
        "Read the first letter on each nonblank line from top to bottom.",
        "Ignore blank lines and recover the original phrase."
    ].join(" ");
    const prompt = [instruction, coverText].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "cover-text-line-acrostic",
        inputs: [
            {
                key: "cover_text",
                valueType: "acrostic-cover-text",
                description: "The cohesive line-oriented text containing the acrostic.",
                required: true,
                constraints: {
                    genre,
                    maximumCharacters: MAX_COVER_TEXT_LENGTH,
                    minimumWordsPerLine: MIN_WORDS_PER_LINE,
                    minimumPlainWrapRatio: MIN_PLAIN_WRAP_RATIO,
                    preservesLineBreaks: true
                },
                value: coverText
            },
            {
                key: "extraction_rule",
                valueType: "acrostic-extraction-rule",
                description: "The ordered line-initial extraction convention.",
                required: true,
                constraints: { ruleVersion: RULE_VERSION },
                value: extractionRule
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered from the ordered line initials.",
            value: answer
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: coverText },
        prompt,
        solution: {
            valueType: "text",
            canonical: answer,
            normalization: ["trim", "case-insensitive", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: true, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            acrostic: {
                genre,
                ...extractionRule,
                extractedLetters,
                validatedMessage,
                coverTextSha256: sourceHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (extractAcrostic(coverText) !== answer.replaceAll(" ", "")) {
        throw new Error(
            "Internal validation failed: the line initials did not recover the intended solution."
        );
    }

    return puzzle;
}
