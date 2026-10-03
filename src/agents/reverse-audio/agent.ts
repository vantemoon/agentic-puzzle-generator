import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { REVERSE_AUDIO_SYSTEM_PROMPT } from "./prompt.js";
import { createReverseAudioPuzzleTool } from "./tool.js";

export async function createReverseAudioAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: REVERSE_AUDIO_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createReverseAudioPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
