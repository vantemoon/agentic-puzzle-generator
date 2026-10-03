import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import type { LevelDesignRequest } from "../../levels/types.js";
import { buildLevelDesignPrompt } from "./prompt.js";
import { createSubmitLevelBlueprintTool } from "./tool.js";

export async function createLevelDesignAgent(
    catalog: PuzzleCatalog,
    request?: LevelDesignRequest,
    outputDirectory?: string
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
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
