import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type AsciiArtRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type AsciiArtStyle = "block" | "outline" | "shadow" | "texture";
export type AsciiArtSubjectKind = "text" | "object";
export type AsciiArtObject = "ARROW" | "CAT" | "FISH" | "HEART" | "HOUSE" | "KEY" | "LOCK" | "STAR" | "TREE";

export interface AsciiArtPuzzleSpec extends PuzzleGenerationSpec {
    recognitionLevel: AsciiArtRecognitionLevel;
    artStyle?: AsciiArtStyle;
    subjectKind?: AsciiArtSubjectKind;
    artCharacters?: string;
    readingHint?: string;
    acceptedAlternatives?: string[];
}

const TEMPLATE_VERSION = "ascii-art-v2";
const MAX_MESSAGE_LENGTH = 32;
const LEVELS: readonly AsciiArtRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const STYLES: readonly AsciiArtStyle[] = ["block", "outline", "shadow", "texture"];
const SUBJECT_KINDS: readonly AsciiArtSubjectKind[] = ["text", "object"];
const OBJECTS: readonly AsciiArtObject[] = ["ARROW", "CAT", "FISH", "HEART", "HOUSE", "KEY", "LOCK", "STAR", "TREE"];

const FONT: Record<string, readonly string[]> = {
    A: [" ### ", "#   #", "#####", "#   #", "#   #"],
    B: ["#### ", "#   #", "#### ", "#   #", "#### "],
    C: [" ####", "#    ", "#    ", "#    ", " ####"],
    D: ["#### ", "#   #", "#   #", "#   #", "#### "],
    E: ["#####", "#    ", "#### ", "#    ", "#####"],
    F: ["#####", "#    ", "#### ", "#    ", "#    "],
    G: [" ####", "#    ", "# ###", "#   #", " ####"],
    H: ["#   #", "#   #", "#####", "#   #", "#   #"],
    I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
    J: ["#####", "   # ", "   # ", "#  # ", " ##  "],
    K: ["#   #", "#  # ", "###  ", "#  # ", "#   #"],
    L: ["#    ", "#    ", "#    ", "#    ", "#####"],
    M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
    N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
    O: [" ### ", "#   #", "#   #", "#   #", " ### "],
    P: ["#### ", "#   #", "#### ", "#    ", "#    "],
    Q: [" ### ", "#   #", "# # #", "#  # ", " ## #"],
    R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
    S: [" ####", "#    ", " ### ", "    #", "#### "],
    T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
    U: ["#   #", "#   #", "#   #", "#   #", " ### "],
    V: ["#   #", "#   #", "#   #", " # # ", "  #  "],
    W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
    X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
    Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
    Z: ["#####", "   # ", "  #  ", " #   ", "#####"],
    "0": [" ### ", "#  ##", "# # #", "##  #", " ### "],
    "1": ["  #  ", " ##  ", "  #  ", "  #  ", "#####"],
    "2": [" ### ", "#   #", "   # ", "  #  ", "#####"],
    "3": ["#### ", "    #", " ### ", "    #", "#### "],
    "4": ["#   #", "#   #", "#####", "    #", "    #"],
    "5": ["#####", "#    ", "#### ", "    #", "#### "],
    "6": [" ### ", "#    ", "#### ", "#   #", " ### "],
    "7": ["#####", "   # ", "  #  ", " #   ", " #   "],
    "8": [" ### ", "#   #", " ### ", "#   #", " ### "],
    "9": [" ### ", "#   #", " ####", "    #", " ### "],
    "!": ["  #  ", "  #  ", "  #  ", "     ", "  #  "],
    "?": [" ### ", "#   #", "   # ", "     ", "  #  "],
    "-": ["     ", "     ", "#####", "     ", "     "],
    ".": ["     ", "     ", "     ", "     ", "  #  "],
    " ": ["     ", "     ", "     ", "     ", "     "]
};

const OBJECT_ART: Record<AsciiArtObject, readonly string[]> = {
    ARROW: ["    ##     ", "     ##    ", "######>    ", "     ##    ", "    ##     "],
    CAT: [" /\_/\\    ", "( o.o )   ", " > ^ <    ", " /   \\    ", "(_| |_)   "],
    FISH: ["   _      ", "><_)))'>  ", "          ", "   _      ", "><_)))'>  "],
    HEART: [" ** **    ", "*******   ", " *****    ", "  ***     ", "   *      "],
    HOUSE: ["   /\\     ", "  /  \\    ", " /____\\   ", " | [] |   ", " |____|   "],
    KEY: ["  __      ", " /  \\____", " \__/--.-", "      ||  ", "      ''  "],
    LOCK: ["  ___     ", " /   \\    ", "|_____|   ", "|  _  |   ", "|_____|   "],
    STAR: ["   *      ", "  ***     ", "*******   ", "  ***     ", " *   *    "],
    TREE: ["   ^      ", "  ^^^     ", " ^^^^^    ", "   |      ", "  / \\     "]
};

const REVERSE_FONT = new Map(Object.entries(FONT).map(([character, rows]) => [rows.join("\n"), character]));

export function normalizeAsciiArtMessage(input: string): string {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();
    if (normalized.length === 0) throw new Error("The ASCII-art message must not be empty.");
    if (normalized.length > MAX_MESSAGE_LENGTH) throw new Error(`The ASCII-art message must not exceed ${MAX_MESSAGE_LENGTH} characters.`);
    for (const character of normalized) if (FONT[character] === undefined) throw new Error("The ASCII-art message may contain only A-Z, digits, spaces, and ! ? - . punctuation.");
    return normalized;
}

export function normalizeAsciiArtSubjectKind(input: string | undefined): AsciiArtSubjectKind {
    const subjectKind = input ?? "text";
    if (!SUBJECT_KINDS.includes(subjectKind as AsciiArtSubjectKind)) throw new Error(`The ASCII-art subject kind must be one of: ${SUBJECT_KINDS.join(", ")}.`);
    return subjectKind as AsciiArtSubjectKind;
}

export function normalizeAsciiArtObject(input: string): AsciiArtObject {
    const normalized = input.trim().replace(/\s+/g, " ").toUpperCase();
    if (!OBJECTS.includes(normalized as AsciiArtObject)) throw new Error(`The ASCII-art object must be one of: ${OBJECTS.join(", ")}.`);
    return normalized as AsciiArtObject;
}

export function normalizeAsciiArtSolution(input: string, subjectKind: AsciiArtSubjectKind): string {
    return subjectKind === "object" ? normalizeAsciiArtObject(input) : normalizeAsciiArtMessage(input);
}

function defaultCharactersForStyle(style: AsciiArtStyle): string {
    if (style === "outline") return "@";
    if (style === "shadow") return "$";
    if (style === "texture") return "#@%+=*";
    return "#";
}

export function normalizeAsciiArtCharacters(input: string | undefined, style: AsciiArtStyle = "block"): string {
    if (input === undefined) return defaultCharactersForStyle(style);
    const unique = [...new Set([...input])].join("");
    if (unique.length === 0) throw new Error("ASCII-art characters must not be empty.");
    if (unique.length > 12) throw new Error("ASCII-art characters must not contain more than 12 unique characters.");
    if (/[^!-~]/.test(unique)) throw new Error("ASCII-art characters must be non-space printable ASCII characters.");
    return unique;
}

export function normalizeAsciiArtRecognitionLevel(input: string): AsciiArtRecognitionLevel {
    if (!LEVELS.includes(input as AsciiArtRecognitionLevel)) throw new Error(`The recognition level must be one of: ${LEVELS.join(", ")}.`);
    return input as AsciiArtRecognitionLevel;
}

export function normalizeAsciiArtStyle(input: string | undefined): AsciiArtStyle {
    const style = input ?? "block";
    if (!STYLES.includes(style as AsciiArtStyle)) throw new Error(`The ASCII-art style must be one of: ${STYLES.join(", ")}.`);
    return style as AsciiArtStyle;
}

export function normalizeAsciiArtReadingHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error("The reading hint must not be empty.");
    if (normalized.length > 300) throw new Error("The reading hint must not exceed 300 characters.");
    if (/[^\x20-\x7E]/.test(normalized)) throw new Error("The reading hint may contain printable ASCII only.");
    return normalized;
}

function fillRows(rows: readonly string[], style: AsciiArtStyle, artCharacters: string): string[] {
    const palette = [...artCharacters];
    const fillSet = new Set(["#", "@", "$", "*", ">", "<", "_", "-", ".", "'", "^", "|", "/", "\\", "[", "]", "(", ")"]);
    return rows.map((row, rowIndex) => [...row].map((character, columnIndex) => {
        if (character === " ") return " ";
        if (!fillSet.has(character)) return character;
        if (style === "outline") return palette[(rowIndex + columnIndex) % palette.length];
        if (style === "shadow") return palette[(rowIndex * 3 + columnIndex) % palette.length];
        if (style === "texture") return palette[(rowIndex * 11 + columnIndex * 7) % palette.length];
        return palette[0];
    }).join(""));
}

function glyphRows(character: string, style: AsciiArtStyle, artCharacters: string): string[] {
    return fillRows(FONT[character], style, artCharacters);
}

function canonicalizeArtForDecoding(art: string): string[] {
    return art.split("\n").map((line) => line.replace(/\S/g, "#").replace(/\s+$/g, ""));
}

export function renderAsciiArt(message: string, style: AsciiArtStyle = "block", artCharacters?: string): string {
    const normalized = normalizeAsciiArtMessage(message);
    const normalizedStyle = normalizeAsciiArtStyle(style);
    const normalizedCharacters = normalizeAsciiArtCharacters(artCharacters, normalizedStyle);
    const lines = Array.from({ length: 5 }, () => "");
    for (const character of normalized) {
        const rows = glyphRows(character, normalizedStyle, normalizedCharacters);
        for (let row = 0; row < 5; row += 1) lines[row] += `${rows[row]}  `;
    }
    return lines.map((line) => line.replace(/\s+$/g, "")).join("\n");
}

export function renderAsciiObject(object: string, style: AsciiArtStyle = "block", artCharacters?: string): string {
    const normalizedObject = normalizeAsciiArtObject(object);
    const normalizedStyle = normalizeAsciiArtStyle(style);
    const normalizedCharacters = normalizeAsciiArtCharacters(artCharacters, normalizedStyle);
    return fillRows(OBJECT_ART[normalizedObject], normalizedStyle, normalizedCharacters).map((line) => line.replace(/\s+$/g, "")).join("\n");
}

export function extractAsciiObject(art: string): AsciiArtObject {
    const canonical = canonicalizeArtForDecoding(art).join("\n");
    for (const object of OBJECTS) {
        if (canonicalizeArtForDecoding(OBJECT_ART[object].join("\n")).join("\n") === canonical) return object;
    }
    throw new Error("ASCII art contains an unknown object silhouette.");
}

export function extractAsciiArtMessage(art: string): string {
    const lines = canonicalizeArtForDecoding(art);
    if (lines.length !== 5) throw new Error("ASCII art must contain exactly five rows.");
    const width = Math.max(...lines.map((line) => line.length));
    const padded = lines.map((line) => line.padEnd(width, " "));
    const characters: string[] = [];
    for (let column = 0; column < width; column += 7) {
        const glyph = padded.map((line) => line.slice(column, column + 5).padEnd(5, " ")).join("\n");
        const character = REVERSE_FONT.get(glyph);
        if (character === undefined) throw new Error("ASCII art contains an unknown glyph.");
        characters.push(character);
    }
    return characters.join("").replace(/\s+$/g, "");
}

function normalizeAcceptedAlternatives(values: string[] | undefined, subjectKind: AsciiArtSubjectKind): string[] | undefined {
    if (values === undefined) return undefined;
    const normalized = [...new Set(values.map((value) => normalizeAsciiArtSolution(value, subjectKind)))];
    return normalized.length === 0 ? undefined : normalized;
}

function assertHintPolicy(level: AsciiArtRecognitionLevel, hint: string | undefined): void {
    if (level === "explicit" && hint === undefined) throw new Error("Explicit ASCII-art puzzles require a reading hint.");
    if (level === "hidden" && hint !== undefined) throw new Error("Hidden ASCII-art puzzles must not include a reading hint.");
}

function assertMessageNotLeaked(message: string, hint: string | undefined): void {
    if ((hint ?? "").toUpperCase().includes(message)) throw new Error("The ASCII-art message must not appear in visible public text.");
}

export function createAsciiArtPuzzle(spec: AsciiArtPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");
    const subjectKind = normalizeAsciiArtSubjectKind(spec.subjectKind);
    const message = normalizeAsciiArtSolution(spec.intendedSolution, subjectKind);
    const recognitionLevel = normalizeAsciiArtRecognitionLevel(spec.recognitionLevel);
    const artStyle = normalizeAsciiArtStyle(spec.artStyle);
    const artCharacters = normalizeAsciiArtCharacters(spec.artCharacters, artStyle);
    const readingHint = normalizeAsciiArtReadingHint(spec.readingHint);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives, subjectKind);
    assertHintPolicy(recognitionLevel, readingHint);
    assertMessageNotLeaked(message, readingHint);

    const art = subjectKind === "object" ? renderAsciiObject(message, artStyle, artCharacters) : renderAsciiArt(message, artStyle, artCharacters);
    const extracted = subjectKind === "object" ? extractAsciiObject(art) : extractAsciiArtMessage(art);
    if (extracted !== message) throw new Error("Internal validation failed: ASCII-art extraction did not recover the intended solution.");
    const normalization: Array<"trim" | "case-insensitive" | "collapse-whitespace"> = ["trim", "case-insensitive", "collapse-whitespace"];
    const solution = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: message, normalization }
        : { valueType: "text" as const, canonical: message, acceptedAlternatives, normalization };

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "visual-recognition",
        subtype: "ascii-art",
        inputs: [
            { key: "ascii_art", valueType: "monospace-text-art", description: "A five-row monospace ASCII-art subject visible to the solver.", required: true, constraints: { rows: 5, subjectKind, glyphWidth: subjectKind === "text" ? 5 : undefined, glyphSpacing: subjectKind === "text" ? 2 : undefined, style: artStyle, artCharacters }, value: art },
            { key: "hidden_subject", valueType: subjectKind === "object" ? "ascii-art-object" : "ascii-art-message", description: subjectKind === "object" ? "The object represented by the ASCII-art silhouette." : "The text represented by the ASCII-art glyphs.", required: true, value: message },
            ...(readingHint === undefined ? [] : [{ key: "reading_hint", valueType: "visible-text-hint", description: "Visible hint for reading the ASCII art.", required: false, value: readingHint }])
        ],
        outputs: [{ key: "decoded_subject", valueType: "plain-text", description: "The text or object recognized from the ASCII-art subject.", value: message }],
        artifact: { kind: "text", mediaType: "text/plain", source: art },
        prompt: readingHint === undefined ? "Inspect the monospace ASCII art and identify the hidden subject." : `Inspect the monospace ASCII art. ${readingHint}`,
        solution,
        validator: { kind: "normalized-text", mode: "deterministic", options: { trim: true, caseInsensitive: true, collapseWhitespace: true } },
        externalKnowledge: { required: false },
        extensions: { asciiArt: { templateVersion: TEMPLATE_VERSION, recognitionLevel, artStyle, subjectKind, artCharacters, rows: 5, glyphWidth: subjectKind === "text" ? 5 : undefined, glyphSpacing: subjectKind === "text" ? 2 : undefined } }
    };

    assertPrivatePuzzleInstance(puzzle);
    const artifactSource = getPuzzleArtifactSource(puzzle.artifact);
    const artifactExtracted = subjectKind === "object" ? extractAsciiObject(artifactSource) : extractAsciiArtMessage(artifactSource);
    if (artifactExtracted !== puzzle.solution.canonical) throw new Error("Internal validation failed: artifact extraction did not recover the intended solution.");
    return puzzle;
}
