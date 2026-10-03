import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ASCII_ART_SYSTEM_PROMPT } from "./prompt.js";
import { createAsciiArtPuzzleTool } from "./tool.js";

export async function createAsciiArtAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({ initialState: { systemPrompt: ASCII_ART_SYSTEM_PROMPT, model, thinkingLevel: "off", tools: [createAsciiArtPuzzleTool] }, streamFn: modelRuntime.streamSimple.bind(modelRuntime), toolExecution: "sequential" });
}
