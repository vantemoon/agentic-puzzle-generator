import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { SECURE_RELAY_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/asymmetric-sealed-relay/prompt.js";
import { createSecureRelayPuzzleTool } from "../src/features/puzzle-generation/generators/asymmetric-sealed-relay/tool.js";

export default function secureRelayExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "secure-relay-agent", SECURE_RELAY_SYSTEM_PROMPT, createSecureRelayPuzzleTool);
}
