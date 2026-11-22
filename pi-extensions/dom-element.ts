import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { DOM_ELEMENT_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/dom-element/prompt.js";
import { createDomElementPuzzleTool } from "../src/features/puzzle-generation/generators/dom-element/tool.js";

export default function domElementExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "dom-element-agent", DOM_ELEMENT_SYSTEM_PROMPT, createDomElementPuzzleTool);
}
