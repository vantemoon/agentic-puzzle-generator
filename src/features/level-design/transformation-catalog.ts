import type { ScalarDataType } from "./types.js";

export interface TransformationCatalogEntry {
    id: string;
    label: string;
    description: string;
    inputType: ScalarDataType;
    outputType: ScalarDataType;
    difficulty: "easy" | "medium" | "hard";
    instruction: string;
}

export const transformationCatalog: TransformationCatalogEntry[] = [
    { id: "number-words-to-digits", label: "Words → digits", description: "Convert an English number phrase to a number.", inputType: "string", outputType: "number", difficulty: "easy", instruction: "Enter the number using digits." },
    { id: "uppercase", label: "Uppercase", description: "Convert letters to uppercase.", inputType: "string", outputType: "string", difficulty: "easy", instruction: "Enter the value in uppercase." },
    { id: "lowercase", label: "Lowercase", description: "Convert letters to lowercase.", inputType: "string", outputType: "string", difficulty: "easy", instruction: "Enter the value in lowercase." },
    { id: "remove-separators", label: "Remove separators", description: "Remove spaces and a declared separator set.", inputType: "string", outputType: "string", difficulty: "easy", instruction: "Remove the displayed separators." },
    { id: "email-domain", label: "Extract domain", description: "Take the domain portion of an email address.", inputType: "string", outputType: "string", difficulty: "easy", instruction: "Use the part after the @ sign." },
    { id: "path-filename", label: "Extract filename", description: "Take the final filename from a path.", inputType: "string", outputType: "string", difficulty: "easy", instruction: "Use the final path component." },
    { id: "username-convention", label: "Format username", description: "Apply a stated first-initial and surname convention to a full name.", inputType: "string", outputType: "string", difficulty: "medium", instruction: "Apply the username convention stated by the consuming interface." }
];

export function getTransformation(id: string): TransformationCatalogEntry | undefined {
    return transformationCatalog.find((entry) => entry.id === id);
}

export function transformationDifficultyRank(value: "easy" | "medium" | "hard"): number {
    return { easy: 0, medium: 1, hard: 2 }[value];
}

const SMALL_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

function wordsToNumber(value: string): number {
    const words = value.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
    let total = 0;
    let current = 0;
    for (const word of words) {
        if (word === "and") continue;
        if (word === "hundred") { current *= 100; continue; }
        if (word === "thousand") { total += current * 1000; current = 0; continue; }
        const number = SMALL_NUMBERS[word];
        if (number === undefined) throw new Error(`Unsupported number word: ${word}.`);
        current += number;
    }
    return total + current;
}

export function applyTransformation(type: string, value: string | number, config?: Record<string, unknown>): string | number {
    switch (type) {
        case "number-words-to-digits":
            if (typeof value !== "string") throw new Error("number-words-to-digits requires a string.");
            return wordsToNumber(value);
        case "uppercase":
            if (typeof value !== "string") throw new Error("uppercase requires a string.");
            return value.toUpperCase();
        case "lowercase":
            if (typeof value !== "string") throw new Error("lowercase requires a string.");
            return value.toLowerCase();
        case "remove-separators": {
            if (typeof value !== "string") throw new Error("remove-separators requires a string.");
            const separators = typeof config?.separators === "string" ? config.separators : " -_";
            const escaped = separators.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return value.replace(new RegExp(`[${escaped}]`, "g"), "");
        }
        case "email-domain":
            if (typeof value !== "string" || !value.includes("@")) throw new Error("email-domain requires an email address.");
            return value.slice(value.lastIndexOf("@") + 1);
        case "path-filename":
            if (typeof value !== "string") throw new Error("path-filename requires a string.");
            return value.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
        case "username-convention": {
            if (typeof value !== "string") throw new Error("username-convention requires a full name.");
            const parts = value.trim().split(/\s+/);
            if (parts.length < 2) throw new Error("username-convention requires at least two name parts.");
            const separator = typeof config?.separator === "string" ? config.separator : "";
            return `${parts[0][0]}${separator}${parts.at(-1)}`.toLowerCase();
        }
        default:
            throw new Error(`Unknown transformation: ${type}.`);
    }
}
