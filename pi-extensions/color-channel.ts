import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { COLOR_CHANNEL_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/color-channel/prompt.js";
import { createColorChannelPuzzleTool } from "../src/features/puzzle-generation/generators/color-channel/tool.js";

export default function colorChannelExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "color-channel-agent", COLOR_CHANNEL_SYSTEM_PROMPT, createColorChannelPuzzleTool);
}
