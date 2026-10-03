import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { SECURE_RELAY_SYSTEM_PROMPT } from "./prompt.js";
import { createSecureRelayPuzzleTool } from "./tool.js";

export async function createSecureRelayAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: SECURE_RELAY_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createSecureRelayPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}

