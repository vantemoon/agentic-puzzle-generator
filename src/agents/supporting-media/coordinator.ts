import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { resolveModelConfiguration } from "../../core/model.js";
import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { LevelBundle, SupportingMediaRequest } from "../../levels/bundle.js";
import { createSupportingMediaAgent, supportingMediaModelTask } from "./agent.js";
import {
    readWorldMediaAsset,
    readWorldMediaLibrary,
    writeWorldMediaAsset,
    type GeneratedSupportingMedia,
    type WorldMediaAsset
} from "./library.js";

export interface SupportingMediaGenerationResult {
    requestId: string;
    status: "generated" | "reused";
    asset: WorldMediaAsset;
}

function sorted(values: string[]): string[] {
    return [...values].sort((left, right) => left.localeCompare(right));
}

function sameValues(left: string[], right: string[]): boolean {
    return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function expectedMediaType(kind: SupportingMediaRequest["kind"]): WorldMediaAsset["mediaType"] {
    if (kind === "raster-image") return "image/png";
    if (kind === "svg") return "image/svg+xml";
    return "text/html";
}

function promptContext(
    request: SupportingMediaRequest,
    bundle: LevelBundle,
    inputs: LevelBundleInputs
): string {
    const entities = [...inputs.world.entities, ...bundle.worldAdditions.entities]
        .filter((entity) => request.worldEntityIds.includes(entity.id));
    const entityIds = new Set(request.worldEntityIds);
    const facts = [...inputs.world.facts, ...bundle.worldAdditions.facts].filter((fact) =>
        entityIds.has(fact.subjectId)
        || (fact.value.kind === "entity" && entityIds.has(fact.value.entityId))
    );
    const site = bundle.sites.find((candidate) => candidate.id === request.siteId);
    if (site === undefined) throw new Error(`Supporting-media request ${request.id} references missing site ${request.siteId}.`);
    return JSON.stringify({
        request,
        site: {
            id: site.id,
            name: site.name,
            archetype: site.archetype,
            visualProfile: site.visualProfile
        },
        world: {
            id: inputs.world.id,
            revision: inputs.world.revision,
            entities,
            facts
        }
    }, null, 2);
}

function privateAnswers(inputs: LevelBundleInputs): string[] {
    return inputs.puzzles.flatMap(({ puzzle }) => [
        puzzle.solution.canonical,
        ...(puzzle.solution.acceptedAlternatives ?? [])
    ]);
}

export async function generateSupportingMedia(options: {
    bundle: LevelBundle;
    inputs: LevelBundleInputs;
    rootDirectory?: string;
    onEvent?: (event: AgentEvent, request: SupportingMediaRequest) => void;
    onStatus?: (message: string) => void;
}): Promise<SupportingMediaGenerationResult[]> {
    const rootDirectory = options.rootDirectory ?? "generated-world-media";
    const results: SupportingMediaGenerationResult[] = [];
    const answers = privateAnswers(options.inputs);
    let library = await readWorldMediaLibrary(options.inputs.world.id, rootDirectory);

    for (const request of options.bundle.mediaRequests) {
        const existing = library.assets.find((asset) => asset.id === request.id);
        if (existing !== undefined) {
            if (existing.kind !== request.kind || !sameValues(existing.worldEntityIds, request.worldEntityIds)) {
                throw new Error(
                    `World media asset ${request.id} conflicts with the current request; use a new stable media ID.`
                );
            }
            await readWorldMediaAsset({
                worldId: options.inputs.world.id,
                asset: existing,
                rootDirectory
            });
            options.onStatus?.(`Reusing supporting media ${request.id}.`);
            results.push({ requestId: request.id, status: "reused", asset: existing });
            continue;
        }

        const task = supportingMediaModelTask(request.kind);
        const model = resolveModelConfiguration(task);
        options.onStatus?.(`Generating ${request.id} with ${model.providerId}/${model.modelId}.`);
        const agent = await createSupportingMediaAgent(request, answers);
        let generated: GeneratedSupportingMedia | undefined;
        let lastError: string | undefined;
        agent.subscribe((event) => {
            options.onEvent?.(event, request);
            if (event.type === "tool_execution_end" && event.toolName === "submit_supporting_media") {
                if (event.isError) {
                    lastError = event.result.content
                        .filter((item: { type: string; text?: string }) => item.type === "text")
                        .map((item: { type: string; text?: string }) => item.text ?? "")
                        .join("\n");
                } else {
                    generated = event.result.details as GeneratedSupportingMedia;
                }
            }
        });
        await agent.prompt(promptContext(request, options.bundle, options.inputs));
        if (generated === undefined) {
            throw new Error(lastError || agent.state.errorMessage || `Supporting Media Agent did not generate ${request.id}.`);
        }
        const asset = await writeWorldMediaAsset({
            worldId: options.inputs.world.id,
            rootDirectory,
            generated,
            asset: {
                id: request.id,
                kind: request.kind,
                mediaType: expectedMediaType(request.kind),
                worldEntityIds: request.worldEntityIds,
                purpose: request.purpose,
                accessibilityText: request.accessibilityText,
                source: {
                    levelId: options.inputs.level.id,
                    siteId: request.siteId,
                    routePath: request.routePath
                },
                generator: {
                    task,
                    modelId: model.modelId,
                    providerId: model.providerId
                }
            }
        });
        library = { ...library, assets: [...library.assets, asset] };
        results.push({ requestId: request.id, status: "generated", asset });
    }
    return results;
}
