import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { QR_CODE_SYSTEM_PROMPT } from "../src/agents/qr-code/prompt.js";
import { createQrCodePuzzleTool } from "../src/agents/qr-code/tool.js";

export default function qrCodeExtension(pi: ExtensionAPI) {
  pi.registerTool(createQrCodePuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["qr-code-agent"] = QR_CODE_SYSTEM_PROMPT;
  });
}
