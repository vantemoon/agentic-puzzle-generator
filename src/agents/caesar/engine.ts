import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export interface CaesarPuzzleSpec extends PuzzleGenerationSpec {
    shift: number;
}

function validateShift(shift: number): void {
    if (!Number.isInteger(shift)) {
        throw new Error("The Caesar cipher shift must be an integer.");
    }

    if (shift < 1 || shift > 25) {
        throw new Error("The Caesar cipher shift must be between 1 and 25.");
    }
}

export function normalizePhrase(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();

    if (normalized.length === 0) {
        throw new Error("The answer must not be empty.");
    }

    if (!/^[A-Z ]+$/.test(normalized)) {
        throw new Error("The answer may contain only English letters and spaces.");
    }

    return normalized;
}

export function transformCaesar(text: string, shift: number): string {
    return [...text]
        .map((character) => {
            if (character === " ") {
                return character;
            }

            const alphabetIndex = character.charCodeAt(0) - 65;
            const shiftedIndex = (alphabetIndex + shift + 26) % 26;
            
            return String.fromCharCode(shiftedIndex + 65);
        })
        .join("");
}

export function encodeCaesar(text: string, shift: number): string {
    validateShift(shift);

    const normalized = normalizePhrase(text);
    return transformCaesar(normalized, shift);
}

export function decodeCaesar(text: string, shift: number): string {
    validateShift(shift);
    
    const normalized = normalizePhrase(text);
    return transformCaesar(normalized, -shift);
}

export function createCaesarPuzzle(spec: CaesarPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }
    validateShift(spec.shift);

    const answer = normalizePhrase(spec.intendedSolution);
    const ciphertext = encodeCaesar(answer, spec.shift);
    const prompt = `Decode this message using a Caesar shift of ${spec.shift}: ${ciphertext}`;
    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "caesar-cipher",
        inputs: [{
            key: "encoded_message",
            valueType: "caesar-ciphertext",
            description: "The Caesar ciphertext visible to the solver.",
            required: true,
            value: ciphertext
        }],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The plaintext recovered by decoding the message.",
            value: answer
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: ciphertext },
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
        extensions: { caesar: { shift: spec.shift } }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeCaesar(getPuzzleArtifactSource(puzzle.artifact), spec.shift) !== puzzle.solution.canonical) {
        throw new Error("Internal validation failed: decoding did not recover the answer.");
    }
    return puzzle;
}
