import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type, { type Static } from "typebox";

import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import {
    BundleSiteArchetypeSchema,
    BundleSiteVisualProfileSchema,
    BundleWorldAdditionsSchema,
    PuzzleRouteSchema,
    StructuralRouteSchema,
    SupportingMediaRequestSchema,
    SupportingRouteSchema,
    TerminalRouteSchema
} from "../../levels/bundle.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import { LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE } from "./limits.js";
import {
    createSubmitLevelBundleTool,
    type LevelBundleAgentOptions,
    type LevelBundleSubmission
} from "./tool.js";

export const LEVEL_BUNDLE_ROUTE_BATCH_SIZE = 5;
export const LEVEL_BUNDLE_SUPPORTING_BATCH_SIZE = 5;
export const LEVEL_BUNDLE_MEDIA_BATCH_SIZE = 5;

const SiteSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    worldEntityId: Type.Optional(Type.String({ minLength: 1 })),
    archetype: BundleSiteArchetypeSchema,
    visualProfile: BundleSiteVisualProfileSchema,
    basePath: Type.String({ minLength: 1 })
}, { additionalProperties: false });

const StructureParameters = Type.Object({
    sites: Type.Array(SiteSchema, { minItems: 1 }),
    worldAdditions: BundleWorldAdditionsSchema,
    terminal: Type.Object({
        siteId: Type.String({ minLength: 1 }),
        routePath: Type.String({ minLength: 1 })
    }, { additionalProperties: false })
}, { additionalProperties: false });

const CoreRouteSchema = Type.Union([
    StructuralRouteSchema,
    PuzzleRouteSchema,
    TerminalRouteSchema
]);

const CoreRouteBatchParameters = Type.Object({
    siteId: Type.String({ minLength: 1 }),
    routes: Type.Array(CoreRouteSchema, {
        minItems: 1,
        maxItems: LEVEL_BUNDLE_ROUTE_BATCH_SIZE
    })
}, { additionalProperties: false });

const SupportingBatchParameters = Type.Object({
    siteId: Type.String({ minLength: 1 }),
    routes: Type.Array(SupportingRouteSchema, {
        minItems: 1,
        maxItems: LEVEL_BUNDLE_SUPPORTING_BATCH_SIZE
    })
}, { additionalProperties: false });

const ReplaceRouteParameters = Type.Object({
    siteId: Type.String({ minLength: 1 }),
    route: Type.Union([
        StructuralRouteSchema,
        PuzzleRouteSchema,
        TerminalRouteSchema,
        SupportingRouteSchema
    ])
}, { additionalProperties: false });

const MediaBatchParameters = Type.Object({
    requests: Type.Array(SupportingMediaRequestSchema, {
        minItems: 1,
        maxItems: LEVEL_BUNDLE_MEDIA_BATCH_SIZE
    })
}, { additionalProperties: false });

const ReplaceMediaParameters = Type.Object({
    request: SupportingMediaRequestSchema
}, { additionalProperties: false });

const FinalizeParameters = Type.Object({}, { additionalProperties: false });

type Structure = Static<typeof StructureParameters>;
type CoreRoute = Static<typeof CoreRouteSchema>;
type SupportingRoute = Static<typeof SupportingRouteSchema>;
type SupportingMediaRequest = Static<typeof SupportingMediaRequestSchema>;

function duplicateValues(values: string[]): string[] {
    return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function siteRelativePath(basePath: string, routePath: string): string {
    if (routePath === basePath) return "/";
    if (routePath.startsWith(`${basePath}/`)) return routePath.slice(basePath.length);
    return routePath;
}

function normalizeCoreRoute(basePath: string, route: CoreRoute): CoreRoute {
    const path = siteRelativePath(basePath, route.path);
    if (route.role !== "puzzle") return { ...route, path };
    if (route.placement === "media-viewer" || route.placement === "downloadable-file") {
        return { ...route, path };
    }
    const { directAssetPath: _unused, ...withoutAssetPath } = route;
    return { ...withoutAssetPath, path };
}

export function createStagedLevelBundleTools(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions,
    outputDirectory?: string
): AgentTool[] {
    let structure: Structure | undefined;
    const coreRoutes = new Map<string, CoreRoute[]>();
    const supportingRoutes = new Map<string, SupportingRoute[]>();
    const mediaRequests: SupportingMediaRequest[] = [];
    const maximumCoreRoutesPerSite = inputs.puzzles.length + LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE;
    const finalTool = createSubmitLevelBundleTool(inputs, catalog, options, outputDirectory);

    const siteFor = (siteId: string) => structure?.sites.find((site) => site.id === siteId);
    const knownPaths = (siteId: string) => new Set([
        ...(coreRoutes.get(siteId) ?? []).map((route) => route.path),
        ...(supportingRoutes.get(siteId) ?? []).map((route) => route.path)
    ]);
    const coreStructureIssues = (): string[] => {
        if (structure === undefined) return ["bundle sites have not been submitted"];
        const puzzleIds = [...coreRoutes.values()].flatMap((routes) => routes
            .filter((route): route is Static<typeof PuzzleRouteSchema> => route.role === "puzzle")
            .map((route) => route.puzzleId));
        const expectedPuzzleIds = inputs.puzzles.map(({ puzzle }) => puzzle.id);
        const terminalRoutes = structure.sites.flatMap((site) => (coreRoutes.get(site.id) ?? [])
            .filter((route) => route.role === "terminal")
            .map((route) => ({ siteId: site.id, routePath: route.path })));
        const terminalMatches = terminalRoutes.length === 1
            && terminalRoutes[0].siteId === structure.terminal.siteId
            && terminalRoutes[0].routePath === structure.terminal.routePath;
        const missing = expectedPuzzleIds.filter((id) => !puzzleIds.includes(id));
        const unknown = puzzleIds.filter((id) => !expectedPuzzleIds.includes(id));
        const duplicates = duplicateValues(puzzleIds);
        return [
            ...(missing.length === 0 ? [] : [`missing puzzles: ${missing.join(", ")}`]),
            ...(unknown.length === 0 ? [] : [`unknown puzzles: ${unknown.join(", ")}`]),
            ...(duplicates.length === 0 ? [] : [`duplicate puzzles: ${duplicates.join(", ")}`]),
            ...(terminalMatches ? [] : ["terminal reference does not identify the single terminal route"])
        ];
    };

    const submitStructure: AgentTool<typeof StructureParameters> = {
        name: "submit_bundle_structure",
        label: "Submit bundle structure",
        description: "Save site identities, visual profiles, proposed world additions, and the terminal reference before adding routes in batches.",
        parameters: StructureParameters,
        async execute(_toolCallId, params) {
            const duplicateIds = duplicateValues(params.sites.map((site) => site.id));
            const duplicateBasePaths = duplicateValues(params.sites.map((site) => site.basePath));
            if (duplicateIds.length > 0 || duplicateBasePaths.length > 0) {
                throw new Error([
                    ...duplicateIds.map((id) => `duplicate site ID ${id}`),
                    ...duplicateBasePaths.map((basePath) => `duplicate site base path ${basePath}`)
                ].join("; "));
            }
            const terminalSite = params.sites.find((site) => site.id === params.terminal.siteId);
            if (terminalSite === undefined) {
                throw new Error(`Terminal site ${params.terminal.siteId} is not part of the submitted structure.`);
            }
            structure = {
                ...params,
                terminal: {
                    ...params.terminal,
                    routePath: siteRelativePath(terminalSite.basePath, params.terminal.routePath)
                }
            };
            coreRoutes.clear();
            supportingRoutes.clear();
            mediaRequests.length = 0;
            return {
                content: [{
                    type: "text",
                    text: `Accepted ${params.sites.length} site definitions. Add all structural, puzzle, and terminal routes with add_bundle_routes in batches of at most ${LEVEL_BUNDLE_ROUTE_BATCH_SIZE}.`
                }],
                details: { siteCount: params.sites.length }
            };
        }
    };

    const addBundleRoutes: AgentTool<typeof CoreRouteBatchParameters> = {
        name: "add_bundle_routes",
        label: "Add structural and required routes",
        description: `Add up to ${LEVEL_BUNDLE_ROUTE_BATCH_SIZE} structural, puzzle, or terminal routes to one submitted site.`,
        parameters: CoreRouteBatchParameters,
        async execute(_toolCallId, params) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before adding routes.");
            const site = siteFor(params.siteId);
            if (site === undefined) throw new Error(`Bundle structure has no site named ${params.siteId}.`);
            const normalizedRoutes = params.routes.map((route) =>
                normalizeCoreRoute(site.basePath, route)
            );
            const existing = coreRoutes.get(params.siteId) ?? [];
            if (existing.length + normalizedRoutes.length > maximumCoreRoutesPerSite) {
                throw new Error(
                    `Site ${params.siteId} may contain at most ${maximumCoreRoutesPerSite} structural, puzzle, and terminal routes.`
                );
            }
            const paths = knownPaths(params.siteId);
            const duplicate = normalizedRoutes.find((route) => paths.has(route.path));
            if (duplicate !== undefined) throw new Error(`Route path ${duplicate.path} already exists on site ${params.siteId}.`);
            coreRoutes.set(params.siteId, [...existing, ...normalizedRoutes]);
            const issues = coreStructureIssues();
            return {
                content: [{
                    type: "text",
                    text: issues.length === 0
                        ? `Accepted ${normalizedRoutes.length} routes for ${params.siteId}. All puzzles and the terminal are now placed; add supporting routes next.`
                        : `Accepted ${normalizedRoutes.length} routes for ${params.siteId}. Required structure is still incomplete: ${issues.join("; ")}.`
                }],
                details: { siteId: params.siteId, batchCount: normalizedRoutes.length, remainingIssues: issues }
            };
        }
    };

    const addSupportingRoutes: AgentTool<typeof SupportingBatchParameters> = {
        name: "add_supporting_routes",
        label: "Add supporting routes",
        description: `Add up to ${LEVEL_BUNDLE_SUPPORTING_BATCH_SIZE} ordinary non-puzzle pages to one submitted site.`,
        parameters: SupportingBatchParameters,
        async execute(_toolCallId, params) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before adding supporting routes.");
            const issues = coreStructureIssues();
            if (issues.length > 0) throw new Error(`Complete required routes first: ${issues.join("; ")}.`);
            const site = siteFor(params.siteId);
            if (site === undefined) throw new Error(`Bundle structure has no site named ${params.siteId}.`);
            const normalizedRoutes = params.routes.map((route) => ({
                ...route,
                path: siteRelativePath(site.basePath, route.path)
            }));
            const existing = supportingRoutes.get(params.siteId) ?? [];
            const paths = knownPaths(params.siteId);
            const duplicate = normalizedRoutes.find((route) => paths.has(route.path));
            if (duplicate !== undefined) throw new Error(`Route path ${duplicate.path} already exists on site ${params.siteId}.`);
            const totalAfterBatch = [...supportingRoutes.values()].reduce(
                (count, routes) => count + routes.length,
                0
            ) + normalizedRoutes.length;
            if (totalAfterBatch > options.supportingItemsMaximum) {
                throw new Error(
                    `Supporting route maximum is ${options.supportingItemsMaximum}; this batch would produce ${totalAfterBatch}.`
                );
            }
            supportingRoutes.set(params.siteId, [...existing, ...normalizedRoutes]);
            return {
                content: [{
                    type: "text",
                    text: `Accepted ${normalizedRoutes.length} supporting routes for ${params.siteId}; ${totalAfterBatch} total supporting routes are now staged.`
                }],
                details: { siteId: params.siteId, batchCount: normalizedRoutes.length, totalSupportingRoutes: totalAfterBatch }
            };
        }
    };

    const replaceBundleRoute: AgentTool<typeof ReplaceRouteParameters> = {
        name: "replace_bundle_route",
        label: "Replace a staged route",
        description: "Replace the content and metadata of one already-staged route after validation reports a problem.",
        parameters: ReplaceRouteParameters,
        async execute(_toolCallId, params) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before replacing routes.");
            const site = siteFor(params.siteId);
            if (site === undefined) throw new Error(`Bundle structure has no site named ${params.siteId}.`);
            const normalizedPath = siteRelativePath(site.basePath, params.route.path);
            const core = coreRoutes.get(params.siteId) ?? [];
            const supporting = supportingRoutes.get(params.siteId) ?? [];
            const coreIndex = core.findIndex((route) => route.path === normalizedPath);
            const supportingIndex = supporting.findIndex((route) => route.path === normalizedPath);
            if (coreIndex < 0 && supportingIndex < 0) {
                throw new Error(
                    `Route path ${normalizedPath} is not staged on ${params.siteId}; use the appropriate add tool.`
                );
            }
            const existing = coreIndex >= 0 ? core[coreIndex] : supporting[supportingIndex];
            if (existing.role !== params.route.role) {
                throw new Error(
                    `Replacement route ${normalizedPath} must keep role ${existing.role}, not ${params.route.role}.`
                );
            }
            if (coreIndex >= 0) {
                const replacement = normalizeCoreRoute(site.basePath, params.route as CoreRoute);
                const updated = [...core];
                updated[coreIndex] = replacement;
                coreRoutes.set(params.siteId, updated);
            } else {
                const updated = [...supporting];
                updated[supportingIndex] = { ...params.route as SupportingRoute, path: normalizedPath };
                supportingRoutes.set(params.siteId, updated);
            }
            return {
                content: [{
                    type: "text",
                    text: `Replaced ${params.siteId}${normalizedPath}. Retry finalize_level_bundle after repairing every reported issue.`
                }],
                details: { siteId: params.siteId, routePath: normalizedPath, role: params.route.role }
            };
        }
    };

    const addMediaRequests: AgentTool<typeof MediaBatchParameters> = {
        name: "add_supporting_media_requests",
        label: "Add supporting media requests",
        description: `Add up to ${LEVEL_BUNDLE_MEDIA_BATCH_SIZE} world-grounded, non-puzzle media requests.`,
        parameters: MediaBatchParameters,
        async execute(_toolCallId, params) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before adding media requests.");
            const normalized = params.requests.map((request) => {
                const site = siteFor(request.siteId);
                if (site === undefined) throw new Error(`Bundle structure has no site named ${request.siteId}.`);
                const routePath = siteRelativePath(site.basePath, request.routePath);
                if (!knownPaths(request.siteId).has(routePath)) {
                    throw new Error(
                        `Media request ${request.id} references unknown route ${routePath} on ${request.siteId}.`
                    );
                }
                return { ...request, routePath };
            });
            const knownIds = new Set(mediaRequests.map((request) => request.id));
            const duplicate = normalized.find((request, index) =>
                knownIds.has(request.id)
                || normalized.findIndex((candidate) => candidate.id === request.id) !== index
            );
            if (duplicate !== undefined) {
                throw new Error(`Supporting-media request ${duplicate.id} already exists.`);
            }
            mediaRequests.push(...normalized);
            return {
                content: [{
                    type: "text",
                    text: `Accepted ${normalized.length} supporting-media requests; ${mediaRequests.length} total are staged.`
                }],
                details: { batchCount: normalized.length, totalMediaRequests: mediaRequests.length }
            };
        }
    };

    const replaceMediaRequest: AgentTool<typeof ReplaceMediaParameters> = {
        name: "replace_supporting_media_request",
        label: "Replace a supporting-media request",
        description: "Replace one already-staged supporting-media request after validation reports a problem.",
        parameters: ReplaceMediaParameters,
        async execute(_toolCallId, params) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before replacing media requests.");
            const index = mediaRequests.findIndex((request) => request.id === params.request.id);
            if (index < 0) {
                throw new Error(
                    `Supporting-media request ${params.request.id} is not staged; use add_supporting_media_requests.`
                );
            }
            const site = siteFor(params.request.siteId);
            if (site === undefined) throw new Error(`Bundle structure has no site named ${params.request.siteId}.`);
            const routePath = siteRelativePath(site.basePath, params.request.routePath);
            if (!knownPaths(params.request.siteId).has(routePath)) {
                throw new Error(
                    `Media request ${params.request.id} references unknown route ${routePath} on ${params.request.siteId}.`
                );
            }
            mediaRequests[index] = { ...params.request, routePath };
            return {
                content: [{
                    type: "text",
                    text: `Replaced supporting-media request ${params.request.id}. Retry finalize_level_bundle after repairing every reported issue.`
                }],
                details: { requestId: params.request.id, siteId: params.request.siteId, routePath }
            };
        }
    };

    const finalize: AgentTool<typeof FinalizeParameters, LevelBundleSubmission> = {
        name: "finalize_level_bundle",
        label: "Finalize level bundle",
        description: "Assemble, validate, and save the submitted sites and route batches.",
        parameters: FinalizeParameters,
        async execute(toolCallId) {
            if (structure === undefined) throw new Error("Submit bundle site definitions before finalizing.");
            const issues = coreStructureIssues();
            if (issues.length > 0) throw new Error(`Complete required routes first: ${issues.join("; ")}.`);
            const sites = structure.sites.map((site) => ({
                ...site,
                routes: [
                    ...(coreRoutes.get(site.id) ?? []),
                    ...(supportingRoutes.get(site.id) ?? [])
                ]
            }));
            return finalTool.execute(toolCallId, {
                bundle: {
                    sites,
                    worldAdditions: structure.worldAdditions,
                    mediaRequests,
                    terminal: structure.terminal
                }
            });
        }
    };

    return [
        submitStructure,
        addBundleRoutes,
        addSupportingRoutes,
        replaceBundleRoute,
        addMediaRequests,
        replaceMediaRequest,
        finalize
    ];
}
