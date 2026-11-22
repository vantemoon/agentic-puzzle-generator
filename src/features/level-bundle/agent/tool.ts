import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { LevelBundleInputs } from "../inputs.js";
import { bundleAnswers } from "../answers.js";
import { mediaAnswerIssues, routeAnswerIssues, siteAnswerIssues } from "../content-answers.js";
import { writeLevelBundleFile } from "../io.js";
import {
    BundledSiteSchema,
    BundleRouteSchema,
    canonicalizeBundlePagePaths,
    LEVEL_BUNDLE_SCHEMA_VERSION,
    LevelBundleSchema,
    type LevelBundle
} from "../types.js";
import type { PuzzleCatalog } from "../../puzzle-generation/catalog.js";
import { levelBundleRouteMaximum } from "../limits.js";
import { pagePathIssues } from "../page-content.js";

export interface LevelBundleAgentOptions {
    seed: string;
    supportingItemsMinimum: number;
    supportingItemsMaximum: number;
}

function bundleSubmissionParameters(maximumRoutesPerSite: number) {
    const base = Type.Omit(LevelBundleSchema, [
        "schemaVersion",
        "levelId",
        "world",
        "seed",
        "terminal"
    ], { additionalProperties: false });
    const boundedSite = Type.Object({
        ...BundledSiteSchema.properties,
        routes: Type.Array(BundleRouteSchema, {
            minItems: 1,
            maxItems: maximumRoutesPerSite
        })
    }, { additionalProperties: false });
    const bundle = Type.Object({
        ...base.properties,
        sites: Type.Array(boundedSite, { minItems: 1 }),
        terminal: Type.Omit(LevelBundleSchema.properties.terminal, ["mode"], {
            additionalProperties: false
        })
    }, { additionalProperties: false });
    return Type.Object({ bundle }, { additionalProperties: false });
}

export interface LevelBundleSubmission {
    bundle: LevelBundle;
    outputPath: string;
}

function removeDuplicatePuzzleMedia(bundle: LevelBundle): LevelBundle {
    const duplicates = new Set<LevelBundle["mediaRequests"][number]>();
    const sites = bundle.sites.map((site) => ({
        ...site,
        routes: site.routes.map((route) => {
            if (route.role !== "puzzle" || !route.directAssetPath
                || (route.placement !== "media-viewer" && route.placement !== "downloadable-file")) return route;
            const request = bundle.mediaRequests.find((candidate) =>
                candidate.id === route.puzzleId && candidate.siteId === site.id && candidate.routePath === route.path);
            if (request === undefined) return route;
            const blocks = route.content.blocks.filter((block) => block.kind !== "media" || block.mediaId !== request.id);
            if (blocks.length === route.content.blocks.length) return route;
            // The renderer already publishes the puzzle file via its placement.
            if (blocks.length === 0) {
                throw new Error(`Puzzle route ${site.id}${route.path} already publishes its artifact. Remove the duplicate supporting-media request and block, and give the page ordinary site content.`);
            }
            duplicates.add(request);
            return { ...route, content: { ...route.content, blocks } };
        })
    }));
    return { ...bundle, sites, mediaRequests: bundle.mediaRequests.filter((request) => !duplicates.has(request)) };
}

function validateSupportingContent(
    bundle: LevelBundle,
    inputs: LevelBundleInputs,
    options: LevelBundleAgentOptions
): string[] {
    const errors: string[] = [];
    const privateAnswers = bundleAnswers(inputs.puzzles);

    const supportingCount = bundle.sites.reduce(
        (count, site) => count + site.routes.filter((route) => route.role === "supporting").length,
        0
    );
    if (supportingCount > options.supportingItemsMaximum) {
        errors.push(`Level bundle exceeds the maximum of ${options.supportingItemsMaximum} supporting routes; found ${supportingCount}.`);
    }
    for (const input of inputs.level.startingInputs) {
        const source = `starting-input:${input.id}`;
        const matches = bundle.sites.flatMap((site) => site.routes
            .filter((route) => route.discovery?.from.includes(source))
            .map((route) => ({ site, route })));
        if (matches.length !== 1) {
            errors.push(
                `Starting input ${input.id} must expose exactly one initial route; found ${matches.length}. `
                + "Use separate starting inputs when the player receives multiple initial resources."
            );
        }
    }
    const firstInput = inputs.level.startingInputs[0];
    const firstSite = bundle.sites[0];
    if (firstInput !== undefined && firstSite !== undefined) {
        const source = `starting-input:${firstInput.id}`;
        const primaryMatches = bundle.sites.flatMap((site) => site.routes
            .filter((route) => route.discovery?.from.includes(source))
            .map((route) => ({ site, route })));
        if (primaryMatches.length === 1
            && (primaryMatches[0].site.id !== firstSite.id || primaryMatches[0].route.path !== "/")) {
            errors.push(
                `The first starting input ${firstInput.id} must open the home route of the first site `
                + `(${firstSite.id}/). Order sites so the first site is the investigation's initial setting.`
            );
        }
    }
    for (const site of bundle.sites) {
        errors.push(...siteAnswerIssues(site, privateAnswers));
        errors.push(...pagePathIssues(site.basePath));
        errors.push(...site.routes.filter((route) => route.path !== "/").flatMap((route) => pagePathIssues(site.basePath + route.path)));
        errors.push(...site.routes.flatMap((route) => routeAnswerIssues(site, route, privateAnswers)));
    }
    errors.push(...bundle.mediaRequests.flatMap((request) => mediaAnswerIssues(request, privateAnswers)));
    return errors;
}

export function createSubmitLevelBundleTool(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions,
    outputDirectory?: string
): AgentTool<ReturnType<typeof bundleSubmissionParameters>, LevelBundleSubmission> {
    const parameters = bundleSubmissionParameters(levelBundleRouteMaximum(
        inputs.puzzles.length,
        options.supportingItemsMaximum
    ));
    return {
        name: "submit_level_bundle",
        label: "Submit level bundle",
        description: "Validate and save the complete private LevelBundle specification.",
        parameters,

        async execute(_toolCallId, params) {
            const bundle = removeDuplicatePuzzleMedia(canonicalizeBundlePagePaths({
                ...params.bundle,
                schemaVersion: LEVEL_BUNDLE_SCHEMA_VERSION,
                levelId: inputs.level.id,
                world: {
                    id: inputs.level.world.id,
                    revision: inputs.level.world.revision,
                    ...(inputs.level.world.asOf === undefined ? {} : { asOf: inputs.level.world.asOf })
                },
                seed: options.seed,
                terminal: {
                    ...params.bundle.terminal,
                    mode: "validation-api"
                }
            }));
            const contentErrors = validateSupportingContent(bundle, inputs, options);
            if (contentErrors.length > 0) {
                throw new Error(`Level bundle content was rejected:\n- ${contentErrors.join("\n- ")}`);
            }
            const outputPath = await writeLevelBundleFile({
                bundle,
                level: inputs.level,
                catalog,
                world: inputs.world,
                outputDirectory
            });
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "validated-bundle-plan",
                        levelId: bundle.levelId,
                        siteCount: bundle.sites.length,
                        routeCount: bundle.sites.reduce((count, site) => count + site.routes.length, 0),
                        outputPath
                    })
                }],
                details: { bundle, outputPath },
                terminate: true
            };
        }
    };
}
