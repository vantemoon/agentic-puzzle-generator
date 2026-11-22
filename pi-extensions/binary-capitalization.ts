import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { BINARY_CAPITALIZATION_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/binary-capitalization-pattern/prompt.js";
import { createBinaryCapitalizationPuzzleTool } from "../src/features/puzzle-generation/generators/binary-capitalization-pattern/tool.js";

export default function binaryCapitalizationExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(
        pi,
        "binary-capitalization-agent",
        BINARY_CAPITALIZATION_SYSTEM_PROMPT,
        createBinaryCapitalizationPuzzleTool
    );
}
