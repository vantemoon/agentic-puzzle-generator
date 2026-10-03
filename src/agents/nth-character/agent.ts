import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { NTH_CHARACTER_SYSTEM_PROMPT } from "./prompt.js";
import { createNthCharacterPuzzleTool } from "./tool.js";

export async function createNthCharacterAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: NTH_CHARACTER_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createNthCharacterPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
