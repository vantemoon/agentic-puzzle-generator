import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { SupportingMediaRequest } from "../../levels/bundle.js";
import { supportingMediaSystemPrompt } from "./prompt.js";
import { createSupportingMediaTool } from "./tool.js";

export type SupportingMediaModelTask =
    | "supporting-media-raster"
    | "supporting-media-svg"
    | "supporting-media-document";

export function supportingMediaModelTask(kind: SupportingMediaRequest["kind"]): SupportingMediaModelTask {
    if (kind === "raster-image") return "supporting-media-raster";
    if (kind === "svg") return "supporting-media-svg";
    return "supporting-media-document";
}

export async function createSupportingMediaAgent(
    request: SupportingMediaRequest,
    forbiddenAnswers: string[]
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel(supportingMediaModelTask(request.kind));
    const stream = ((selectedModel, context, options) => modelRuntime.streamSimple(selectedModel, context, {
        ...options,
        maxTokens: request.kind === "document" ? 8_000 : 16_000
    })) satisfies typeof modelRuntime.streamSimple;
    return new Agent({
        initialState: {
            systemPrompt: supportingMediaSystemPrompt(request),
            model,
            thinkingLevel: "off",
            tools: [createSupportingMediaTool(request, forbiddenAnswers)]
        },
        streamFn: stream,
        toolExecution: "sequential"
    });
}
