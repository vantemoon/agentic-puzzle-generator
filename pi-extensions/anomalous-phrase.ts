import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ANOMALOUS_PHRASE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/anomalous-phrase/prompt.js";
import { createAnomalousPhrasePuzzleTool } from "../src/features/puzzle-generation/generators/anomalous-phrase/tool.js";

export default function anomalousPhraseExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "anomalous-phrase-agent", ANOMALOUS_PHRASE_SYSTEM_PROMPT, createAnomalousPhrasePuzzleTool);
}
