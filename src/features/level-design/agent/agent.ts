import { Agent } from "../../../shared/agent-runtime/recovering-agent.js";

import { loadKadiModel } from "../../../shared/agent-runtime/model.js";
import type { PuzzleCatalog } from "../../puzzle-generation/catalog.js";
import type { LevelDesignRequest } from "../types.js";
import { buildLevelDesignPrompt } from "./prompt.js";
import { createSubmitLevelBlueprintTool } from "./tool.js";

export async function createLevelDesignAgent(
    catalog: PuzzleCatalog,
    request: LevelDesignRequest,
    outputDirectory?: string
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel("level-design");
    return new Agent({
        initialState: {
            systemPrompt: buildLevelDesignPrompt(catalog, request),
            model,
            thinkingLevel: "off",
            tools: [createSubmitLevelBlueprintTool(catalog, request, outputDirectory)]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
