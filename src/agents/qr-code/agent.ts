import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { QR_CODE_SYSTEM_PROMPT } from "./prompt.js";
import { createQrCodePuzzleTool } from "./tool.js";

export async function createQrCodeAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({ initialState: { systemPrompt: QR_CODE_SYSTEM_PROMPT, model, thinkingLevel: "off", tools: [createQrCodePuzzleTool] }, streamFn: modelRuntime.streamSimple.bind(modelRuntime), toolExecution: "sequential" });
}
