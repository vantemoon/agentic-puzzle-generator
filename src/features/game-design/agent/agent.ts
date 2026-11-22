import { Agent } from "../../../shared/agent-runtime/recovering-agent.js";

import { loadKadiModel } from "../../../shared/agent-runtime/model.js";
import type { PuzzleCatalog } from "../../puzzle-generation/catalog.js";
import { buildGameDesignPrompt } from "./prompt.js";
import { createSubmitGameDesignTool } from "./tool.js";

export async function createGameDesignAgent(
    catalog: PuzzleCatalog,
    userBrief: string,
    rootDirectory?: string
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel("game-design");
    return new Agent({
        initialState: {
            systemPrompt: buildGameDesignPrompt(catalog, userBrief),
            model,
            thinkingLevel: "medium",
            tools: [createSubmitGameDesignTool(catalog, rootDirectory)]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}

