import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
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
            thinkingLevel: "off",
            tools: [createSubmitGameDesignTool(catalog, rootDirectory)]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}

