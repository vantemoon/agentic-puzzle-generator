import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ALPHA_CHANNEL_SYSTEM_PROMPT } from "./prompt.js";
import { createAlphaChannelPuzzleTool } from "./tool.js";

export async function createAlphaChannelAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({ initialState: { systemPrompt: ALPHA_CHANNEL_SYSTEM_PROMPT, model, thinkingLevel: "off", tools: [createAlphaChannelPuzzleTool] }, streamFn: modelRuntime.streamSimple.bind(modelRuntime), toolExecution: "sequential" });
}
