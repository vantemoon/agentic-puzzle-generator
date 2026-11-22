import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ALPHA_CHANNEL_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/alpha-channel/prompt.js";
import { createAlphaChannelPuzzleTool } from "../src/features/puzzle-generation/generators/alpha-channel/tool.js";

export default function alphaChannelExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "alpha-channel-agent", ALPHA_CHANNEL_SYSTEM_PROMPT, createAlphaChannelPuzzleTool);
}
