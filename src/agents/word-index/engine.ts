import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface WordIndexPuzzleSpec extends PuzzleGenerationSpec {
    coverText: string;
    genre: string;
}

interface IndexedWord {
    index: number;
    source: string;
    normalized: string;
}

const MAX_SOLUTION_LENGTH = 120;
const MAX_COVER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const MIN_COVER_WORDS = 30;
const MIN_INTERVENING_WORDS = 3;
const TOKENIZER_VERSION = "ascii-words-apostrophes-v1";
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function normalizeWordIndexPhrase(input: string): string {
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

export function normalizeCoverGenre(input: string): string {
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

export function normalizeCoverText(input: string): string {
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

export function tokenizeCoverText(input: string): IndexedWord[] {
    const coverText = normalizeCoverText(input);
    const matches = coverText.match(WORD_PATTERN) ?? [];

    return matches.map((source, position) => ({
        index: position + 1,
        source,
        normalized: source.toUpperCase()
    }));
}

function containsContiguousSolution(tokens: IndexedWord[], solutionWords: string[]): boolean {
    if (solutionWords.length < 2) return false;

    return tokens.some((_, start) => solutionWords.every(
        (word, offset) => tokens[start + offset]?.normalized === word
    ));
}

export function encodeWordIndices(intendedSolution: string, coverText: string): number[] {
    const answer = normalizeWordIndexPhrase(intendedSolution);
    const tokens = tokenizeCoverText(coverText);
    const solutionWords = answer.split(" ");

    if (tokens.length < MIN_COVER_WORDS) {
        throw new Error(`The cover text must contain at least ${MIN_COVER_WORDS} words.`);
    }
    if (containsContiguousSolution(tokens, solutionWords)) {
        throw new Error("The intended solution must not appear contiguously in the cover text.");
    }

    const selected: number[] = [];
    for (const word of solutionWords) {
        const candidate = tokens.find((token) =>
            token.normalized === word
            && !selected.includes(token.index)
            && selected.every(
                (index) => Math.abs(token.index - index) > MIN_INTERVENING_WORDS
            )
        );

        if (!candidate) {
            throw new Error(
                `The cover text needs another usable occurrence of "${word}" at least `
                + `${MIN_INTERVENING_WORDS} word positions from every selected word.`
            );
        }
        selected.push(candidate.index);
    }

    return selected;
}

export function decodeWordIndices(coverText: string, coordinates: readonly number[]): string {
    const tokens = tokenizeCoverText(coverText);

    if (coordinates.length === 0) {
        throw new Error("The coordinate sequence must not be empty.");
    }

    return coordinates.map((coordinate) => {
        if (!Number.isInteger(coordinate) || coordinate < 1 || coordinate > tokens.length) {
            throw new Error(
                `Coordinate ${String(coordinate)} is outside the 1-${tokens.length} word range.`
            );
        }
        return tokens[coordinate - 1].normalized;
    }).join(" ");
}

export function createWordIndexPuzzle(
    spec: WordIndexPuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeWordIndexPhrase(spec.intendedSolution);
    const coverText = normalizeCoverText(spec.coverText);
    const genre = normalizeCoverGenre(spec.genre);
    const tokens = tokenizeCoverText(coverText);
    const coordinates = encodeWordIndices(answer, coverText);
    const sourceHash = createHash("sha256").update(coverText, "utf8").digest("hex");
    const coordinateText = coordinates.join(", ");
    const artifactSource = [
        "Take the words at these 1-based positions, counting punctuation-free words from the start:",
        coordinateText,
        "",
        coverText
    ].join("\n");
    const prompt = [
        "Recover the hidden message from the cover text using the supplied word indices.",
        artifactSource
    ].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "cover-text-word-index-cipher",
        inputs: [
            {
                key: "cover_text",
                valueType: "indexed-cover-text",
                description: "The cohesive cover text whose words are numbered from one.",
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
                key: "coordinate_sequence",
                valueType: "word-index-sequence",
                description: "The ordered 1-based word positions used to recover the message.",
                required: true,
                constraints: {
                    indexOrigin: 1,
                    minimumInterveningWords: MIN_INTERVENING_WORDS
                },
                value: coordinates
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered by reading the indexed words in order.",
            value: answer
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
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
            wordIndex: {
                genre,
                tokenizerVersion: TOKENIZER_VERSION,
                tokenPattern: WORD_PATTERN.source,
                indexOrigin: 1,
                minimumInterveningWords: MIN_INTERVENING_WORDS,
                coordinates,
                selectedTokens: coordinates.map(
                    (coordinate) => tokens[coordinate - 1].normalized
                ),
                coverTextSha256: sourceHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeWordIndices(coverText, coordinates) !== answer) {
        throw new Error(
            "Internal validation failed: the word indices did not recover the intended solution."
        );
    }

    return puzzle;
}
