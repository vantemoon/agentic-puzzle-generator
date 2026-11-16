import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { LevelBundle, SupportingMediaRequest } from "../../levels/bundle.js";
import type { WorldMediaAsset } from "./library.js";

export function supportingMediaRequestContext(
    request: SupportingMediaRequest,
    bundle: LevelBundle,
    inputs: LevelBundleInputs
) {
    const site = bundle.sites.find((candidate) => candidate.id === request.siteId);
    if (site === undefined) throw new Error(`Supporting-media request ${request.id} references missing site ${request.siteId}.`);
    const entityIds = new Set(request.worldEntityIds);
    const entities = [...inputs.world.entities, ...bundle.worldAdditions.entities]
        .filter((entity) => entityIds.has(entity.id));
    const facts = [...inputs.world.facts, ...bundle.worldAdditions.facts].filter((fact) =>
        entityIds.has(fact.subjectId)
        || (fact.value.kind === "entity" && entityIds.has(fact.value.entityId))
    );
    const source = { levelId: inputs.level.id, siteId: request.siteId, routePath: request.routePath };
    const answers = [...new Set(inputs.puzzles.flatMap(({ puzzle }) => [
        puzzle.solution.canonical,
        ...(puzzle.solution.acceptedAlternatives ?? [])
    ]))].sort();
    const prompt = JSON.stringify({
        request: { ...request, worldEntityIds: [...entityIds].sort() },
        site: {
            id: site.id,
            name: site.name,
            archetype: site.archetype,
            visualProfile: site.visualProfile
        },
        world: { id: inputs.world.id, revision: inputs.world.revision, entities, facts }
    }, (_key, value: unknown) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, (value as Record<string, unknown>)[key]]));
    }, 2);
    const digest = createHash("sha256")
        .update(JSON.stringify([source.levelId, prompt, answers]))
        .digest("hex");
    return { source, answers, prompt, assetId: `media-${digest}` };
}

export function findSupportingMediaAsset(
    assets: readonly WorldMediaAsset[],
    request: SupportingMediaRequest,
    context: ReturnType<typeof supportingMediaRequestContext>
): WorldMediaAsset | undefined {
    return assets.find((asset) => asset.id === context.assetId)
        // Older assets lack a fingerprint. Compare the request fields they recorded.
        ?? assets.find((asset) => asset.id === request.id
            && asset.kind === request.kind
            && isDeepStrictEqual(asset.source, context.source)
            && asset.purpose === request.purpose
            && asset.accessibilityText === request.accessibilityText
            && isDeepStrictEqual([...asset.worldEntityIds].sort(), [...request.worldEntityIds].sort()));
}
