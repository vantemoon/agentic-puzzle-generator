import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { COLOR_CHANNEL_SYSTEM_PROMPT } from "./prompt.js";
import { createColorChannelPuzzleTool } from "./tool.js";

export async function createColorChannelAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({ initialState: { systemPrompt: COLOR_CHANNEL_SYSTEM_PROMPT, model, thinkingLevel: "off", tools: [createColorChannelPuzzleTool] }, streamFn: modelRuntime.streamSimple.bind(modelRuntime), toolExecution: "sequential" });
}
