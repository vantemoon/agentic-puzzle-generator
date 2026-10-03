import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface SubstitutionPuzzleSpec extends PuzzleGenerationSpec {
    cipherAlphabet: string;
}

const PLAIN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_SOLUTION_LENGTH = 120;

export function normalizeSubstitutionPhrase(input: string): string {
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

export function normalizeCipherAlphabet(input: string): string {
    const normalized = input.replace(/\s+/g, "").toUpperCase();

    if (!/^[A-Z]{26}$/.test(normalized)) {
        throw new Error(
            "The cipher alphabet must contain exactly 26 English letters; whitespace is ignored."
        );
    }
    if (new Set(normalized).size !== 26) {
        throw new Error("The cipher alphabet must contain each English letter exactly once.");
    }
    if (normalized === PLAIN_ALPHABET) {
        throw new Error("The cipher alphabet must not be the identity mapping.");
    }

    return normalized;
}

function translate(text: string, sourceAlphabet: string, targetAlphabet: string): string {
    return [...text].map((character) => {
        if (character === " ") return character;

        const index = sourceAlphabet.indexOf(character);
        if (index === -1) {
            throw new Error(`Character "${character}" is not present in the source alphabet.`);
        }
        return targetAlphabet[index];
    }).join("");
}

export function encodeSubstitution(text: string, cipherAlphabet: string): string {
    const plaintext = normalizeSubstitutionPhrase(text);
    const normalizedAlphabet = normalizeCipherAlphabet(cipherAlphabet);
    return translate(plaintext, PLAIN_ALPHABET, normalizedAlphabet);
}

export function decodeSubstitution(text: string, cipherAlphabet: string): string {
    const ciphertext = normalizeSubstitutionPhrase(text);
    const normalizedAlphabet = normalizeCipherAlphabet(cipherAlphabet);
    return translate(ciphertext, normalizedAlphabet, PLAIN_ALPHABET);
}

export function createSubstitutionPuzzle(
    spec: SubstitutionPuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeSubstitutionPhrase(spec.intendedSolution);
    const cipherAlphabet = normalizeCipherAlphabet(spec.cipherAlphabet);
    const ciphertext = encodeSubstitution(answer, cipherAlphabet);
    const artifactSource = [
        `Plain:  ${PLAIN_ALPHABET}`,
        `Cipher: ${cipherAlphabet}`,
        "",
        `Message: ${ciphertext}`
    ].join("\n");
    const prompt = [
        "Decode the substitution-cipher message using the supplied alphabet mapping.",
        artifactSource
    ].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "monoalphabetic-substitution",
        inputs: [
            {
                key: "encoded_message",
                valueType: "substitution-ciphertext",
                description: "The monoalphabetic substitution ciphertext visible to the solver.",
                required: true,
                constraints: { alphabet: "A-Z", preservesSpaces: true },
                value: ciphertext
            },
            {
                key: "cipher_alphabet",
                valueType: "substitution-alphabet",
                description: "The cipher alphabet aligned with the standard A-Z plaintext alphabet.",
                required: true,
                constraints: { length: 26, uniqueLetters: true, orientation: "plain-to-cipher" },
                value: cipherAlphabet
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered by applying the supplied substitution mapping.",
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
            substitution: {
                plainAlphabet: PLAIN_ALPHABET,
                cipherAlphabet,
                mappingDirection: "plain-to-cipher"
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeSubstitution(ciphertext, cipherAlphabet) !== answer) {
        throw new Error(
            "Internal validation failed: decoding did not recover the intended solution."
        );
    }

    return puzzle;
}
