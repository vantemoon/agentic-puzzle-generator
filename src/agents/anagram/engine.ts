import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface AnagramPuzzleSpec extends PuzzleGenerationSpec {
    clue: string;
    scrambleSeed?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 120;
const MIN_LETTER_COUNT = 4;
const MAX_LETTER_COUNT = 80;
const MAX_CLUE_LENGTH = 400;
const MAX_SEED_LENGTH = 120;
const ALPHABET = "A-Z";
const SHUFFLE_VERSION = "sha256-xorshift32-fisher-yates-preserve-spaces-v1";

export function normalizeAnagramAnswer(input: string): string {
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

    const letterCount = countLetters(normalized);
    if (letterCount < MIN_LETTER_COUNT) {
        throw new Error(`The intended solution must contain at least ${MIN_LETTER_COUNT} letters.`);
    }
    if (letterCount > MAX_LETTER_COUNT) {
        throw new Error(`The intended solution must contain no more than ${MAX_LETTER_COUNT} letters.`);
    }
    if (new Set(lettersOnly(normalized)).size < 2) {
        throw new Error("The intended solution must contain at least two distinct letters.");
    }

    return normalized;
}

export function normalizeAnagramClue(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
        throw new Error("The anagram clue must not be empty.");
    }
    if (normalized.length > MAX_CLUE_LENGTH) {
        throw new Error(`The anagram clue must not exceed ${MAX_CLUE_LENGTH} characters.`);
    }
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            "The anagram clue may contain printable ASCII and common typographic punctuation."
        );
    }

    return normalized;
}

export function normalizeScrambleSeed(input: string | undefined): string {
    if (input === undefined) return "default";

    const normalized = input.trim();
    if (normalized.length === 0) {
        throw new Error("The scramble seed must not be empty when supplied.");
    }
    if (normalized.length > MAX_SEED_LENGTH) {
        throw new Error(`The scramble seed must not exceed ${MAX_SEED_LENGTH} characters.`);
    }
    if (/[^\x20-\x7E]/.test(normalized)) {
        throw new Error("The scramble seed may contain only printable ASCII characters.");
    }

    return normalized;
}

export function lettersOnly(input: string): string {
    return input.replace(/[^A-Za-z]/g, "").toUpperCase();
}

function countLetters(input: string): number {
    return lettersOnly(input).length;
}

function sortedLetters(input: string): string {
    return [...lettersOnly(input)].sort().join("");
}

function createDeterministicRandom(seedMaterial: string): () => number {
    const digest = createHash("sha256").update(seedMaterial, "utf8").digest();
    let state = digest.readUInt32BE(0);
    if (state === 0) state = 0x9E3779B9;

    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state >>>= 0;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x100000000;
    };
}

export function buildDeterministicAnagramLetters(answerInput: string, seedInput?: string): string {
    const answer = normalizeAnagramAnswer(answerInput);
    const seed = normalizeScrambleSeed(seedInput);
    const originalLetters = lettersOnly(answer);
    const shuffled = [...originalLetters];
    const random = createDeterministicRandom(`${SHUFFLE_VERSION}:${seed}:${originalLetters}`);

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    if (shuffled.join("") === originalLetters) {
        const swapIndex = shuffled.findIndex((letter) => letter !== shuffled[0]);
        if (swapIndex === -1) {
            throw new Error("The intended solution cannot produce a meaningful anagram.");
        }
        [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
    }

    let letterIndex = 0;
    return [...answer].map((character) => {
        if (character === " ") return " ";
        const shuffledLetter = shuffled[letterIndex];
        letterIndex += 1;
        return shuffledLetter;
    }).join("");
}

function normalizeAcceptedAlternatives(
    alternatives: string[] | undefined,
    canonicalAnswer: string
): string[] | undefined {
    if (alternatives === undefined) return undefined;

    const canonicalLetters = sortedLetters(canonicalAnswer);
    const normalized = alternatives.map(normalizeAnagramAnswer);
    const unique = [...new Set(normalized)].filter((alternative) => alternative !== canonicalAnswer);

    for (const alternative of unique) {
        if (sortedLetters(alternative) !== canonicalLetters) {
            throw new Error(
                "Accepted anagram alternatives must use exactly the same letters as the canonical solution."
            );
        }
    }

    return unique.length > 0 ? unique : undefined;
}

export function createAnagramPuzzle(spec: AnagramPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeAnagramAnswer(spec.intendedSolution);
    const clue = normalizeAnagramClue(spec.clue);
    const seed = normalizeScrambleSeed(spec.scrambleSeed);
    const letterBank = buildDeterministicAnagramLetters(answer, seed);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives, answer);
    const artifactSource = [
        "Unscramble the letters to answer the clue.",
        `Clue: ${clue}`,
        `Letters: ${letterBank}`
    ].join("\n");
    const prompt = artifactSource;

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "reconstruction",
        subtype: "anagram",
        inputs: [
            {
                key: "letter_bank",
                valueType: "anagram-letter-bank",
                description: "The shuffled letters visible to the solver.",
                required: true,
                constraints: {
                    alphabet: ALPHABET,
                    spacesPreserved: true,
                    minLetters: MIN_LETTER_COUNT,
                    maxLetters: MAX_LETTER_COUNT,
                    shuffleVersion: SHUFFLE_VERSION
                },
                value: letterBank
            },
            {
                key: "clue",
                valueType: "semantic-clue",
                description: "A public clue that constrains the intended reconstruction.",
                required: true,
                constraints: {
                    maximumCharacters: MAX_CLUE_LENGTH
                },
                value: clue
            }
        ],
        outputs: [{
            key: "reconstructed_answer",
            valueType: "plain-text",
            description: "The plaintext answer recovered by solving the anagram.",
            value: answer
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
        prompt,
        solution: {
            valueType: "text",
            canonical: answer,
            acceptedAlternatives,
            normalization: ["trim", "case-insensitive", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: true, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            anagram: {
                alphabet: ALPHABET,
                spacesPreserved: true,
                scrambleSeed: seed,
                shuffleVersion: SHUFFLE_VERSION,
                letterBankSha256: createHash("sha256").update(letterBank, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (sortedLetters(letterBank) !== sortedLetters(answer)) {
        throw new Error("Internal validation failed: letter bank does not match the solution letters.");
    }

    return puzzle;
}
