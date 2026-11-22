import type { AgentTool } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "./model.js";
import { Agent } from "./recovering-agent.js";

export interface PuzzleAgentOptions {
    subtype: string;
    systemPrompt: string;
    tool: AgentTool;
    maximumOutputTokens?: number;
}

/** Build the standard single-tool agent used by every puzzle subtype. */
export async function createPuzzleAgent(options: PuzzleAgentOptions): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel({
        kind: "puzzle",
        subtype: options.subtype
    });
    const stream = options.maximumOutputTokens === undefined
        ? modelRuntime.streamSimple.bind(modelRuntime)
        : ((selectedModel, context, streamOptions) => modelRuntime.streamSimple(
            selectedModel,
            context,
            { ...streamOptions, maxTokens: options.maximumOutputTokens }
        )) satisfies typeof modelRuntime.streamSimple;

    return new Agent({
        initialState: {
            systemPrompt: options.systemPrompt,
            model,
            thinkingLevel: "off",
            tools: [options.tool]
        },
        streamFn: stream,
        toolExecution: "sequential"
    });
}
