import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type MorsePuzzleSpec = PuzzleGenerationSpec;

export function normalizePhrase(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();
    
    if (normalized.length === 0) {
        throw new Error("The answer must not be empty.");
    }

    if (!/^[A-Z0-9 .,?'!-]+$/.test(normalized)) {
        throw new Error(
            "The answer may contain only English letters, digits, spaces, and simple punctuation."
        );
    }

    return normalized;
}

export function encodeMorse(text: string): string {
    const morseCodeMap: Record<string, string> = {
        A: ".-",
        B: "-...",
        C: "-.-.",
        D: "-..",
        E: ".",
        F: "..-.",
        G: "--.",
        H: "....",
        I: "..",
        J: ".---",
        K: "-.-",
        L: ".-..",
        M: "--",
        N: "-.",
        O: "---",
        P: ".--.",
        Q: "--.-",
        R: ".-.",
        S: "...",
        T: "-",
        U: "..-",
        V: "...-",
        W: ".--",
        X: "-..-",
        Y: "-.--",
        Z: "--..",
        "0": "-----",
        "1": ".----",
        "2": "..---",
        "3": "...--",
        "4": "....-",
        "5": ".....",
        "6": "-....",
        "7": "--...",
        "8": "---..",
        "9": "----.",
        ".": ".-.-.-",
        ",": "--..--",
        "?": "..--..",
        "'": ".----.",
        "!": "-.-.--",
        "-": "-....-",
        " ": "/"
    };

    const normalized = normalizePhrase(text);

    return [...normalized]
        .map((character) => {
            const morse = morseCodeMap[character];
            if (!morse) {
                throw new Error(`Character "${character}" cannot be encoded in Morse code.`);
            }
            return morse;
        })
        .join(" ");
}

export function decodeMorse(text: string): string {
    const morseCodeMap: Record<string, string> = {
        ".-": "A",
        "-...": "B",
        "-.-.": "C",
        "-..": "D",
        ".": "E",
        "..-.": "F",
        "--.": "G",
        "....": "H",
        "..": "I",
        ".---": "J",
        "-.-": "K",
        ".-..": "L",
        "--": "M",
        "-.": "N",
        "---": "O",
        ".--.": "P",
        "--.-": "Q",
        ".-.": "R",
        "...": "S",
        "-": "T",
        "..-": "U",
        "...-": "V",
        ".--": "W",
        "-..-": "X",
        "-.--": "Y",
        "--..": "Z",
        "-----": "0",
        ".----": "1",
        "..---": "2",
        "...--": "3",
        "....-": "4",
        ".....": "5",
        "-....": "6",
        "--...": "7",
        "---..": "8",
        "----.": "9",
        ".-.-.-": ".",
        "--..--": ",",
        "..--..": "?",
        ".----.": "'",
        "-.-.--": "!",
        "-....-": "-",
        "/": " "
    };

    const normalized = text.trim().replace(/\s+/g, " ");

    return normalized
        .split(" ")
        .map((morse) => {
            const character = morseCodeMap[morse];
            if (character === undefined) {
                throw new Error(`Morse code "${morse}" cannot be decoded.`);
            }
            return character;
        })
        .join("");
}

export function createMorsePuzzle(spec: MorsePuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizePhrase(spec.intendedSolution);
    const ciphertext = encodeMorse(answer);
    const prompt = `Decode this Morse code message: ${ciphertext}`;
    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "morse-code",
        inputs: [{
            key: "encoded_message",
            valueType: "morse-code",
            description: "The Morse sequence visible to the solver.",
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
        extensions: { morse: {} }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeMorse(getPuzzleArtifactSource(puzzle.artifact)) !== puzzle.solution.canonical) {
        throw new Error("Internal validation failed: decoding did not recover the answer.");
    }
    return puzzle;
}
