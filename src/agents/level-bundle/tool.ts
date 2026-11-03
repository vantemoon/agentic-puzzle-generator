import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import { writeLevelBundleFile } from "../../levels/bundle-io.js";
import {
    BundledSiteSchema,
    BundleRouteSchema,
    LEVEL_BUNDLE_SCHEMA_VERSION,
    LevelBundleSchema,
    type LevelBundle
} from "../../levels/bundle.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import { levelBundleRouteMaximum } from "./limits.js";

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

function normalized(value: string, caseInsensitive = false): string {
    const whitespaceNormalized = value.replace(/\s+/g, " ").trim();
    return caseInsensitive ? whitespaceNormalized.toLocaleLowerCase() : whitespaceNormalized;
}

function validateSupportingContent(
    bundle: LevelBundle,
    inputs: LevelBundleInputs,
    options: LevelBundleAgentOptions
): string[] {
    const errors: string[] = [];
    const privateAnswers = inputs.puzzles.flatMap(({ puzzle }) => {
        const caseInsensitive = puzzle.validator.kind === "normalized-text"
            && puzzle.validator.options.caseInsensitive;
        return [puzzle.solution.canonical, ...(puzzle.solution.acceptedAlternatives ?? [])]
            .map((value) => ({ value: normalized(value, caseInsensitive), caseInsensitive }));
    }).filter((answer) => answer.value.length > 0);

    const supportingCount = bundle.sites.reduce(
        (count, site) => count + site.routes.filter((route) => route.role === "supporting").length,
        0
    );
    if (supportingCount < options.supportingItemsMinimum || supportingCount > options.supportingItemsMaximum) {
        errors.push(
            `Level bundle must contain ${options.supportingItemsMinimum}-${options.supportingItemsMaximum} ` +
            `supporting routes in total; found ${supportingCount}.`
        );
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
        if (!bundle.mediaRequests.some((request) => request.siteId === site.id)) {
            errors.push(`Bundled site ${site.id} must plan at least one supporting-media asset.`);
        }
        for (const route of site.routes.filter((candidate) => candidate.role === "supporting" || candidate.role === "structural")) {
            const publicText = normalized([
                route.content.title,
                route.content.description,
                JSON.stringify(route.content.blocks)
            ].join("\n"));
            for (const answer of privateAnswers) {
                const comparableText = answer.caseInsensitive ? publicText.toLocaleLowerCase() : publicText;
                if (comparableText.includes(answer.value)) {
                    errors.push(`Non-puzzle route ${site.basePath}${route.path === "/" ? "" : route.path} leaks a puzzle answer.`);
                    break;
                }
            }
        }
    }
    for (const request of bundle.mediaRequests) {
        const publicText = normalized([
            request.purpose,
            request.brief,
            request.accessibilityText
        ].join("\n"));
        for (const answer of privateAnswers) {
            const comparableText = answer.caseInsensitive ? publicText.toLocaleLowerCase() : publicText;
            if (comparableText.includes(answer.value)) {
                errors.push(`Supporting-media request ${request.id} leaks a puzzle answer.`);
                break;
            }
        }
    }
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
            const bundle: LevelBundle = {
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
            };
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
