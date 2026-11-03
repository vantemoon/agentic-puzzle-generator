import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import { buildLevelBundlePrompt } from "./prompt.js";
import type { LevelBundleAgentOptions } from "./tool.js";
import {
    LEVEL_BUNDLE_REPEATED_FAILURE_LIMIT,
    LEVEL_BUNDLE_TRUNCATED_SUBMISSION_LIMIT
} from "./limits.js";
import { createStagedLevelBundleTools } from "./staged-tool.js";

const BUNDLE_TOOL_NAMES = new Set([
    "submit_bundle_structure",
    "add_bundle_routes",
    "add_supporting_routes",
    "replace_bundle_route",
    "add_supporting_media_requests",
    "replace_supporting_media_request",
    "finalize_level_bundle"
]);
const OUTPUT_LIMIT_MARKER = "response hit the output token limit";

export function isLevelBundleToolName(name: string): boolean {
    return BUNDLE_TOOL_NAMES.has(name);
}

export function stopAfterRepeatedTruncatedBundleSubmissions(
    agent: Pick<Agent, "afterToolCall">,
    failureLimit = LEVEL_BUNDLE_TRUNCATED_SUBMISSION_LIMIT
): void {
    const existingHook = agent.afterToolCall;
    let truncatedFailures = 0;
    let repeatedFailures = 0;
    let previousFailure = "";
    agent.afterToolCall = async (context, signal) => {
        const existingResult = await existingHook?.(context, signal);
        if (!isLevelBundleToolName(context.toolCall.name) || !context.isError) {
            previousFailure = "";
            repeatedFailures = 0;
            return existingResult;
        }
        const errorText = context.result.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n");
        const fingerprint = `${context.toolCall.name}\n${errorText}`;
        repeatedFailures = fingerprint === previousFailure ? repeatedFailures + 1 : 1;
        previousFailure = fingerprint;

        const truncated = errorText.includes(OUTPUT_LIMIT_MARKER);
        if (truncated) truncatedFailures += 1;
        const shouldStopForTruncation = truncatedFailures >= failureLimit;
        const shouldStopForRepetition = repeatedFailures >= LEVEL_BUNDLE_REPEATED_FAILURE_LIMIT;
        if (!shouldStopForTruncation && !shouldStopForRepetition) return existingResult;

        const message = shouldStopForTruncation
            ? `Level bundle generation stopped after ${truncatedFailures} truncated tool calls. A staged request still exceeded the model output limit.`
            : `Level bundle generation stopped after ${repeatedFailures} identical ${context.toolCall.name} failures: ${errorText}`;
        return {
            ...existingResult,
            content: [{
                type: "text",
                text: message
            }],
            isError: true,
            terminate: true
        };
    };
}

export async function createLevelBundleAgent(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions,
    outputDirectory?: string
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel("level-bundle");
    const agent = new Agent({
        initialState: {
            systemPrompt: buildLevelBundlePrompt(inputs, catalog, options),
            model,
            thinkingLevel: "off",
            tools: createStagedLevelBundleTools(inputs, catalog, options, outputDirectory)
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
    stopAfterRepeatedTruncatedBundleSubmissions(agent);
    return agent;
}
