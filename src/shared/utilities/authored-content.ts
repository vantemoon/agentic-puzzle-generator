export const AUTHORED_CONTENT_MODES = ["prose-composition", "visual-composition"] as const;
export const PUZZLE_MODEL_GROUPS = ["webpage-composition"] as const;

export type AuthoredContentMode = typeof AUTHORED_CONTENT_MODES[number];
export type PuzzleModelGroup = typeof PUZZLE_MODEL_GROUPS[number];

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

const modelGroupByPuzzleSubtype: Readonly<Record<string, PuzzleModelGroup>> = {
    "alt-text": "webpage-composition",
    "dom-element": "webpage-composition",
    "html-comment": "webpage-composition",
    "html-source-inspection": "webpage-composition",
    "page-version": "webpage-composition"
};

export function authoredContentForPuzzle(subtype: string): AuthoredContentDefinition | undefined {
    return authoredContentByPuzzleSubtype[subtype];
}

export function puzzleModelGroupForSubtype(subtype: string): PuzzleModelGroup | undefined {
    return modelGroupByPuzzleSubtype[subtype];
}
