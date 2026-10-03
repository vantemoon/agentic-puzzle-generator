import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { MORSE_AUDIO_SYSTEM_PROMPT } from "./prompt.js";
import { createMorseAudioPuzzleTool } from "./tool.js";

export async function createMorseAudioAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({ initialState: { systemPrompt: MORSE_AUDIO_SYSTEM_PROMPT, model, thinkingLevel: "off", tools: [createMorseAudioPuzzleTool] }, streamFn: modelRuntime.streamSimple.bind(modelRuntime), toolExecution: "sequential" });
}
