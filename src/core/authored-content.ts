export type AuthoredContentMode = "prose-composition" | "visual-composition";

export interface AuthoredContentDefinition {
    mode: AuthoredContentMode;
    fields: string[];
}

const authoredContentByPuzzleSubtype: Readonly<Record<string, AuthoredContentDefinition>> = {
    "cover-text-line-acrostic": { mode: "prose-composition", fields: ["coverText"] },
    "binary-capitalization-pattern": { mode: "prose-composition", fields: ["carrierText"] },
    "capital-letter-extraction": { mode: "prose-composition", fields: ["carrierText"] },
    "periodic-letter-extraction": { mode: "prose-composition", fields: ["carrierText"] },
    "periodic-word-extraction": { mode: "prose-composition", fields: ["coverText"] },
    "cover-text-line-telestich": { mode: "prose-composition", fields: ["coverText"] },
    "cover-text-word-index-cipher": { mode: "prose-composition", fields: ["coverText"] },
    "alt-text": { mode: "visual-composition", fields: ["imageElements"] },
    "visual-clue": {
        mode: "visual-composition",
        fields: ["backgroundElements", "clueElements", "showClueLabel"]
    }
};

export function authoredContentForPuzzle(subtype: string): AuthoredContentDefinition | undefined {
    return authoredContentByPuzzleSubtype[subtype];
}
