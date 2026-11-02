import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import { buildLevelBundlePrompt } from "./prompt.js";
import { createSubmitLevelBundleTool, type LevelBundleAgentOptions } from "./tool.js";

export async function createLevelBundleAgent(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions,
    outputDirectory?: string
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel("level-bundle");
    return new Agent({
        initialState: {
            systemPrompt: buildLevelBundlePrompt(inputs, catalog, options),
            model,
            thinkingLevel: "off",
            tools: [createSubmitLevelBundleTool(inputs, catalog, options, outputDirectory)]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
