import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import { writeLevelBundleFile } from "../../levels/bundle-io.js";
import {
    LEVEL_BUNDLE_SCHEMA_VERSION,
    LevelBundleSchema,
    type LevelBundle
} from "../../levels/bundle.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";

export interface LevelBundleAgentOptions {
    seed: string;
    supportingItemsMinimum: number;
    supportingItemsMaximum: number;
}

const BundleSubmissionBaseSchema = Type.Omit(LevelBundleSchema, [
    "schemaVersion",
    "levelId",
    "world",
    "seed",
    "terminal"
], { additionalProperties: false });
const BundleSubmissionSchema = Type.Object({
    ...BundleSubmissionBaseSchema.properties,
    terminal: Type.Omit(LevelBundleSchema.properties.terminal, ["mode"], {
        additionalProperties: false
    })
}, { additionalProperties: false });

const parameters = Type.Object({
    bundle: BundleSubmissionSchema
}, { additionalProperties: false });

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

    for (const site of bundle.sites) {
        const supporting = site.routes.filter((route) => route.role === "supporting");
        if (supporting.length < options.supportingItemsMinimum || supporting.length > options.supportingItemsMaximum) {
            errors.push(
                `Site ${site.id} must contain ${options.supportingItemsMinimum}-${options.supportingItemsMaximum} ` +
                `supporting routes; found ${supporting.length}.`
            );
        }
        for (const route of site.routes.filter((candidate) => candidate.role === "supporting" || candidate.role === "structural")) {
            const publicText = normalized([
                route.content.title,
                route.content.description,
                ...route.content.body
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
    return errors;
}

export function createSubmitLevelBundleTool(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions,
    outputDirectory?: string
): AgentTool<typeof parameters, LevelBundleSubmission> {
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
