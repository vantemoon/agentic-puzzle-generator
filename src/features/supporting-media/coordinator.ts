import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { promptAgentWithRecovery } from "../../shared/agent-runtime/agent-runner.js";
import { resolveModelConfiguration } from "../../shared/agent-runtime/model.js";
import { toolResultText } from "../../shared/agent-runtime/progress.js";
import type { LevelBundleInputs } from "../level-bundle/inputs.js";
import type { LevelBundle, SupportingMediaRequest } from "../level-bundle/types.js";
import { createSupportingMediaAgent, supportingMediaModelTask } from "./agent/agent.js";
import {
    readWorldMediaAsset,
    readWorldMediaLibrary,
    writeWorldMediaAsset,
    type GeneratedSupportingMedia,
    type WorldMediaAsset
} from "./library.js";
import { findSupportingMediaAsset, supportingMediaRequestContext } from "./request.js";

export interface SupportingMediaGenerationResult {
    requestId: string;
    status: "generated" | "reused";
    asset: WorldMediaAsset;
}

function expectedMediaType(kind: SupportingMediaRequest["kind"]): WorldMediaAsset["mediaType"] {
    if (kind === "raster-image") return "image/png";
    if (kind === "svg") return "image/svg+xml";
    return "text/html";
}

export async function generateSupportingMedia(options: {
    bundle: LevelBundle;
    inputs: LevelBundleInputs;
    rootDirectory?: string;
    onEvent?: (event: AgentEvent, request: SupportingMediaRequest) => void;
    onStatus?: (status: { state: "start" | "complete"; message: string }) => void;
}): Promise<SupportingMediaGenerationResult[]> {
    const rootDirectory = options.rootDirectory ?? "generated-world-media";
    const results: SupportingMediaGenerationResult[] = [];
    let library = await readWorldMediaLibrary(options.inputs.world.id, rootDirectory);

    for (const [index, request] of options.bundle.mediaRequests.entries()) {
        const prefix = `[${index + 1}/${options.bundle.mediaRequests.length}]`;
        const context = supportingMediaRequestContext(request, options.bundle, options.inputs);
        const existing = findSupportingMediaAsset(library.assets, request, context);
        if (existing !== undefined) {
            await readWorldMediaAsset({
                worldId: options.inputs.world.id,
                asset: existing,
                rootDirectory
            });
            options.onStatus?.({ state: "complete", message: `${prefix} Reused supporting media: ${request.id}` });
            results.push({ requestId: request.id, status: "reused", asset: existing });
            continue;
        }

        const task = supportingMediaModelTask(request.kind);
        const model = resolveModelConfiguration(task);
        options.onStatus?.({ state: "start", message: `${prefix} Generating supporting media: ${request.id}` });
        const agent = await createSupportingMediaAgent(request, context.answers);
        let generated: GeneratedSupportingMedia | undefined;
        let lastError: string | undefined;
        let lastReply: string | undefined;
        agent.subscribe((event) => {
            options.onEvent?.(event, request);
            if (event.type === "tool_execution_end" && event.toolName === "submit_supporting_media") {
                if (event.isError) {
                    lastError = toolResultText(event.result);
                } else {
                    generated = event.result.details as GeneratedSupportingMedia;
                }
            }
            if (event.type === "message_end" && event.message.role === "assistant") {
                lastReply = toolResultText(event.message)?.slice(0, 600) ?? lastReply;
            }
        });
        await promptAgentWithRecovery(agent, context.prompt);
        if (generated === undefined) {
            throw new Error(`Supporting media ${request.id} (${request.kind}) failed: `
                + (lastError || agent.state.errorMessage || lastReply || "The agent did not submit an asset."));
        }
        const asset = await writeWorldMediaAsset({
            worldId: options.inputs.world.id,
            rootDirectory,
            generated,
            asset: {
                id: context.assetId,
                kind: request.kind,
                mediaType: expectedMediaType(request.kind),
                worldEntityIds: request.worldEntityIds,
                purpose: request.purpose,
                accessibilityText: request.accessibilityText,
                source: context.source,
                generator: {
                    task,
                    modelId: model.modelId,
                    providerId: model.providerId
                }
            }
        });
        library = { ...library, assets: [...library.assets, asset] };
        results.push({ requestId: request.id, status: "generated", asset });
        options.onStatus?.({ state: "complete", message: `${prefix} Completed supporting media: ${request.id}` });
    }
    return results;
}
