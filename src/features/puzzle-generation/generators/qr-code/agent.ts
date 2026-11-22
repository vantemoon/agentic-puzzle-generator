import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { QR_CODE_SYSTEM_PROMPT } from "./prompt.js";
import { createQrCodePuzzleTool } from "./tool.js";

export function createQrCodeAgent() {
    return createPuzzleAgent({
        subtype: "qr-code",
        systemPrompt: QR_CODE_SYSTEM_PROMPT,
        tool: createQrCodePuzzleTool
    });
}
