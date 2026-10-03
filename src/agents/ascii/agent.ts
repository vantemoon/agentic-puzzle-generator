import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ASCII_SYSTEM_PROMPT } from "./prompt.js";
import { createAsciiPuzzleTool } from "./tool.js";

export async function createAsciiAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: ASCII_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createAsciiPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
