import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface VigenerePuzzleSpec extends PuzzleGenerationSpec {
    key: string;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_SOLUTION_LENGTH = 120;
const MAX_KEY_LENGTH = 64;

export function normalizeVigenerePhrase(input: string): string {
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

export function normalizeVigenereKey(input: string): string {
    const normalized = input.replace(/\s+/g, "").toUpperCase();

    if (normalized.length === 0) {
        throw new Error("The Vigenere key must not be empty.");
    }
    if (normalized.length > MAX_KEY_LENGTH) {
        throw new Error(`The Vigenere key must not exceed ${MAX_KEY_LENGTH} letters.`);
    }
    if (!/^[A-Z]+$/.test(normalized)) {
        throw new Error("The Vigenere key may contain only English letters and whitespace.");
    }

    return normalized;
}

function transformVigenere(text: string, key: string, direction: 1 | -1): string {
    const normalizedText = normalizeVigenerePhrase(text);
    const normalizedKey = normalizeVigenereKey(key);
    let keyIndex = 0;

    return [...normalizedText].map((character) => {
        if (character === " ") return character;

        const textIndex = ALPHABET.indexOf(character);
        const shift = ALPHABET.indexOf(normalizedKey[keyIndex % normalizedKey.length]);
        const transformedIndex = (textIndex + direction * shift + ALPHABET.length)
            % ALPHABET.length;
        keyIndex += 1;
        return ALPHABET[transformedIndex];
    }).join("");
}

export function encodeVigenere(text: string, key: string): string {
    return transformVigenere(text, key, 1);
}

export function decodeVigenere(text: string, key: string): string {
    return transformVigenere(text, key, -1);
}

export function createVigenerePuzzle(
    spec: VigenerePuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeVigenerePhrase(spec.intendedSolution);
    const key = normalizeVigenereKey(spec.key);
    const ciphertext = encodeVigenere(answer, key);
    const artifactSource = [
        `Key: ${key}`,
        `Message: ${ciphertext}`
    ].join("\n");
    const prompt = [
        "Decode the message using the supplied repeating Vigenere key.",
        artifactSource
    ].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "vigenere-cipher",
        inputs: [
            {
                key: "encoded_message",
                valueType: "vigenere-ciphertext",
                description: "The Vigenere ciphertext visible to the solver.",
                required: true,
                constraints: {
                    alphabet: "A-Z",
                    preservesSpaces: true,
                    keyAdvancesOn: "letters-only"
                },
                value: ciphertext
            },
            {
                key: "key",
                valueType: "vigenere-key",
                description: "The repeating keyword used to shift the message letters.",
                required: true,
                constraints: {
                    alphabet: "A-Z",
                    minLength: 1,
                    maxLength: MAX_KEY_LENGTH,
                    repeats: true
                },
                value: key
            }
        ],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered with the supplied Vigenere key.",
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
            vigenere: {
                alphabet: ALPHABET,
                alphabetIndexOrigin: 0,
                key,
                keyRepeats: true,
                keyAdvancesOn: "letters-only"
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeVigenere(ciphertext, key) !== answer) {
        throw new Error(
            "Internal validation failed: decoding did not recover the intended solution."
        );
    }

    return puzzle;
}
