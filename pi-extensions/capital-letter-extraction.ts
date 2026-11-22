import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/capital-letter-extraction/prompt.js";
import { createCapitalLetterExtractionPuzzleTool } from "../src/features/puzzle-generation/generators/capital-letter-extraction/tool.js";

export default function capitalLetterExtractionExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(
        pi,
        "capital-letter-extraction-agent",
        CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT,
        createCapitalLetterExtractionPuzzleTool
    );
}
