import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { VIGENERE_SYSTEM_PROMPT } from "./prompt.js";
import { createVigenerePuzzleTool } from "./tool.js";

export async function createVigenereAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: VIGENERE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createVigenerePuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
