import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { QR_CODE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/qr-code/prompt.js";
import { createQrCodePuzzleTool } from "../src/features/puzzle-generation/generators/qr-code/tool.js";

export default function qrCodeExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "qr-code-agent", QR_CODE_SYSTEM_PROMPT, createQrCodePuzzleTool);
}
