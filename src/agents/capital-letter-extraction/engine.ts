import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface CapitalLetterExtractionPuzzleSpec extends PuzzleGenerationSpec {
    carrierText: string;
    genre: string;
}

const MAX_SOLUTION_LENGTH = 120;
const MAX_CARRIER_TEXT_LENGTH = 8_000;
const MAX_GENRE_LENGTH = 80;
const RULE_VERSION = "uppercase-ascii-extraction-v2";
const ASCII_LETTER = /[A-Za-z]/;
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function normalizeCapitalLetterSolution(input: string): string {
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

export function normalizeCapitalLetterCarrier(input: string): string {
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

export function normalizeCapitalLetterGenre(input: string): string {
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

function containsVisibleSolution(carrierText: string, solution: string): boolean {
    const normalizedCarrier = carrierText.replace(/\s+/g, " ").toUpperCase();
    return solution.length >= 4 && normalizedCarrier.includes(solution);
}

function findVisibleAnswerWord(carrierText: string, solution: string): string | undefined {
    const carrierWords = carrierText.match(WORD_PATTERN)?.map((word) => word.toUpperCase()) ?? [];
    const answerWords = solution.split(" ").filter((word) => word.length >= 4);

    return answerWords.find((answerWord) =>
        carrierWords.some((carrierWord) => carrierWord.includes(answerWord))
    );
}

export function extractCapitalLetters(source: string): string {
    return [...source].filter((character) => /[A-Z]/.test(character)).join("");
}

export function applyCapitalLetterExtraction(
    carrierInput: string,
    solutionInput: string
): string {
    const carrierText = normalizeCapitalLetterCarrier(carrierInput);
    const solution = normalizeCapitalLetterSolution(solutionInput);
    const targetLetters = solution.replaceAll(" ", "");

    if (containsVisibleSolution(carrierText, solution)) {
        throw new Error("The intended solution must not appear contiguously in the carrier text.");
    }
    const visibleAnswerWord = findVisibleAnswerWord(carrierText, solution);
    if (visibleAnswerWord !== undefined) {
        throw new Error(
            `The answer word "${visibleAnswerWord}" must not appear within a carrier word.`
        );
    }

    let targetIndex = 0;
    let selectedInCurrentWord = false;
    const artifact = [...carrierText].map((character) => {
        if (!ASCII_LETTER.test(character)) {
            if (character !== "'" && character !== "’") {
                selectedInCurrentWord = false;
            }
            return character;
        }

        const uppercase = character.toUpperCase();
        if (
            !selectedInCurrentWord
            && targetIndex < targetLetters.length
            && uppercase === targetLetters[targetIndex]
        ) {
            targetIndex += 1;
            selectedInCurrentWord = true;
            return uppercase;
        }

        return character.toLowerCase();
    }).join("");

    if (targetIndex !== targetLetters.length) {
        const remaining = targetLetters.slice(targetIndex);
        throw new Error(
            `The carrier text cannot encode the intended solution in order; missing suffix "${remaining}".`
        );
    }

    return artifact;
}

export function createCapitalLetterExtractionPuzzle(
    spec: CapitalLetterExtractionPuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeCapitalLetterSolution(spec.intendedSolution);
    const carrierText = normalizeCapitalLetterCarrier(spec.carrierText);
    const genre = normalizeCapitalLetterGenre(spec.genre);
    const artifactSource = applyCapitalLetterExtraction(carrierText, solution);
    const extractedLetters = extractCapitalLetters(artifactSource);
    const expectedLetters = solution.replaceAll(" ", "");
    const wordLengths = solution.split(" ").map((word) => word.length);
    const selectedCharacterOffsets = [...artifactSource]
        .map((character, index) => /[A-Z]/.test(character) ? index : -1)
        .filter((index) => index >= 0);
    const artifactHash = createHash("sha256").update(artifactSource, "utf8").digest("hex");
    const extractionRule = {
        unit: "uppercase-ascii-letter",
        direction: "left-to-right",
        lowercaseBehavior: "ignored",
        nonLetterBehavior: "ignored",
        maximumEncodedLettersPerWord: 1,
        ruleVersion: RULE_VERSION
    } as const;
    const instruction = [
        "Read only the capitalized ASCII letters from left to right.",
        "Join them in order and recover the original phrase."
    ].join(" ");
    const prompt = [instruction, artifactSource].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "capital-letter-extraction",
        inputs: [
            {
                key: "carrier_text",
                valueType: "capital-letter-carrier-text",
                description: "The mixed-case carrier text visible to the solver.",
                required: true,
                constraints: {
                    genre,
                    maximumCharacters: MAX_CARRIER_TEXT_LENGTH,
                    encodedLetterCount: expectedLetters.length,
                    maximumEncodedLettersPerWord: 1,
                    preservesLetterCase: true
                },
                value: artifactSource
            },
            {
                key: "extraction_rule",
                valueType: "capital-letter-extraction-rule",
                description: "The left-to-right uppercase-letter extraction convention.",
                required: true,
                constraints: { ruleVersion: RULE_VERSION },
                value: extractionRule
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The phrase recovered from the capitalized letters.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
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
            capitalLetterExtraction: {
                genre,
                ...extractionRule,
                wordLengths,
                extractedLetters,
                selectedCharacterOffsets,
                artifactSha256: artifactHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (extractedLetters !== expectedLetters) {
        throw new Error(
            "Internal validation failed: the capitalized letters did not recover the intended solution."
        );
    }

    return puzzle;
}
