import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { TELESTICH_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/cover-text-line-telestich/prompt.js";
import { createTelestichPuzzleTool } from "../src/features/puzzle-generation/generators/cover-text-line-telestich/tool.js";

export default function telestichExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "telestich-agent", TELESTICH_SYSTEM_PROMPT, createTelestichPuzzleTool);
}
