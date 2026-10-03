import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type AsciiRadix = "decimal" | "hexadecimal" | "binary";

export interface AsciiPuzzleSpec extends PuzzleGenerationSpec {
    radix: AsciiRadix;
}

const MAX_SOLUTION_LENGTH = 80;

export function normalizeAsciiPhrase(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) {
        throw new Error("The intended solution must not be empty.");
    }
    if (normalized.length > MAX_SOLUTION_LENGTH) {
        throw new Error(`The intended solution must not exceed ${MAX_SOLUTION_LENGTH} characters.`);
    }
    if (!/^[\x20-\x7E]+$/.test(normalized)) {
        throw new Error("The intended solution may contain only printable ASCII characters.");
    }
    return normalized;
}

function radixBase(radix: AsciiRadix): number {
    if (radix === "decimal") return 10;
    if (radix === "hexadecimal") return 16;
    if (radix === "binary") return 2;
    throw new Error(`Unsupported ASCII radix: ${String(radix)}.`);
}

export function encodeAscii(text: string, radix: AsciiRadix): string {
    const normalized = normalizeAsciiPhrase(text);
    radixBase(radix);

    return [...normalized].map((character) => {
        const code = character.charCodeAt(0);
        if (radix === "decimal") return String(code);
        if (radix === "hexadecimal") return code.toString(16).toUpperCase().padStart(2, "0");
        return code.toString(2).padStart(8, "0");
    }).join(" ");
}

export function decodeAscii(source: string, radix: AsciiRadix): string {
    const base = radixBase(radix);
    const tokenPattern = radix === "decimal"
        ? /^\d{2,3}$/
        : radix === "hexadecimal"
            ? /^[0-9A-Fa-f]{2}$/
            : /^[01]{8}$/;
    const tokens = source.trim().split(/\s+/);

    if (tokens.length === 0 || tokens.some((token) => !tokenPattern.test(token))) {
        throw new Error(`The artifact contains an invalid ${radix} ASCII code.`);
    }

    return tokens.map((token) => {
        const code = Number.parseInt(token, base);
        if (code < 32 || code > 126) {
            throw new Error(`ASCII code "${token}" is outside the printable range.`);
        }
        return String.fromCharCode(code);
    }).join("");
}

export function createAsciiPuzzle(spec: AsciiPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const answer = normalizeAsciiPhrase(spec.intendedSolution);
    const encoded = encodeAscii(answer, spec.radix);
    const prompt = `Decode these ${spec.radix} ASCII codes: ${encoded}`;
    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "encoding",
        subtype: "ascii-code",
        inputs: [{
            key: "encoded_message",
            valueType: `ascii-${spec.radix}`,
            description: `The ${spec.radix} ASCII codes visible to the solver.`,
            required: true,
            constraints: { separator: "space", printableCodeRange: [32, 126] },
            value: encoded
        }],
        outputs: [{
            key: "decoded_message",
            valueType: "plain-text",
            description: "The text recovered by decoding the ASCII codes.",
            value: answer
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: encoded },
        prompt,
        solution: {
            valueType: "text",
            canonical: answer,
            normalization: ["trim", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: { ascii: { radix: spec.radix } }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (decodeAscii(getPuzzleArtifactSource(puzzle.artifact), spec.radix) !== puzzle.solution.canonical) {
        throw new Error("Internal validation failed: decoding did not recover the intended solution.");
    }
    return puzzle;
}
