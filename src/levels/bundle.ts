import Type, { type Static } from "typebox";
import Value from "typebox/value";

import {
    getPuzzleCatalogEntry,
    type BundlePlacementStrategy,
    type PuzzleCatalog
} from "./catalog.js";
import type { LevelBlueprint } from "./types.js";
import {
    WorldEntitySchema,
    WorldFactSchema,
    type GameWorld
} from "../world/types.js";

const closed = { additionalProperties: false } as const;

export const LEVEL_BUNDLE_SCHEMA_VERSION = "2.0.0";

export const BundlePlacementStrategySchema = Type.Union([
    Type.Literal("page-body"),
    Type.Literal("native-html"),
    Type.Literal("media-viewer"),
    Type.Literal("downloadable-file"),
    Type.Literal("version-set")
]);

export const BundleSiteArchetypeSchema = Type.Union([
    Type.Literal("blog"),
    Type.Literal("organization"),
    Type.Literal("gallery"),
    Type.Literal("records"),
    Type.Literal("directory"),
    Type.Literal("version-history"),
    Type.Literal("audio-archive"),
    Type.Literal("database"),
    Type.Literal("generic")
]);

const BundleProseBlockSchema = Type.Object({
    kind: Type.Literal("prose"),
    heading: Type.Optional(Type.String({ minLength: 1 })),
    paragraphs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
}, closed);

const BundleListBlockSchema = Type.Object({
    kind: Type.Literal("list"),
    heading: Type.Optional(Type.String({ minLength: 1 })),
    items: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
}, closed);

const BundleRecordBlockSchema = Type.Object({
    kind: Type.Literal("records"),
    heading: Type.Optional(Type.String({ minLength: 1 })),
    entries: Type.Array(Type.Object({
        label: Type.String({ minLength: 1 }),
        value: Type.String({ minLength: 1 })
    }, closed), { minItems: 1 })
}, closed);

const BundleTableBlockSchema = Type.Object({
    kind: Type.Literal("table"),
    heading: Type.Optional(Type.String({ minLength: 1 })),
    columns: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    rows: Type.Array(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }), { minItems: 1 })
}, closed);

const BundleCardBlockSchema = Type.Object({
    kind: Type.Literal("cards"),
    heading: Type.Optional(Type.String({ minLength: 1 })),
    items: Type.Array(Type.Object({
        title: Type.String({ minLength: 1 }),
        summary: Type.String({ minLength: 1 }),
        href: Type.Optional(Type.String({ minLength: 1 }))
    }, closed), { minItems: 1 })
}, closed);

const BundleMediaBlockSchema = Type.Object({
    kind: Type.Literal("media"),
    mediaId: Type.String({ minLength: 1 }),
    caption: Type.Optional(Type.String({ minLength: 1 }))
}, closed);

export const BundleContentBlockSchema = Type.Union([
    BundleProseBlockSchema,
    BundleListBlockSchema,
    BundleRecordBlockSchema,
    BundleTableBlockSchema,
    BundleCardBlockSchema,
    BundleMediaBlockSchema
]);

export const BundlePageContentSchema = Type.Object({
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    blocks: Type.Array(BundleContentBlockSchema, { minItems: 1 })
}, closed);

export const BundleSiteVisualProfileSchema = Type.Object({
    tone: Type.Union([
        Type.Literal("warm"),
        Type.Literal("neutral"),
        Type.Literal("formal"),
        Type.Literal("playful"),
        Type.Literal("artistic")
    ]),
    fontStyle: Type.Union([
        Type.Literal("sans"),
        Type.Literal("serif"),
        Type.Literal("mixed"),
        Type.Literal("mono-accent")
    ]),
    density: Type.Union([
        Type.Literal("compact"),
        Type.Literal("comfortable"),
        Type.Literal("spacious")
    ]),
    accentColor: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
    mediaStyle: Type.String({ minLength: 1 })
}, closed);

export const SupportingMediaRequestSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    siteId: Type.String({ minLength: 1 }),
    routePath: Type.String({ minLength: 1 }),
    kind: Type.Union([
        Type.Literal("raster-image"),
        Type.Literal("svg"),
        Type.Literal("document")
    ]),
    purpose: Type.String({ minLength: 1 }),
    brief: Type.String({ minLength: 1 }),
    accessibilityText: Type.String({ minLength: 1 }),
    worldEntityIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
}, closed);

export const BundleWorldAdditionsSchema = Type.Object({
    entities: Type.Array(WorldEntitySchema),
    facts: Type.Array(WorldFactSchema)
}, closed);

export const BundleDiscoverySchema = Type.Object({
    kind: Type.Union([
        Type.Literal("direct-link"),
        Type.Literal("navigation"),
        Type.Literal("lookup"),
        Type.Literal("stable-path"),
        Type.Literal("search")
    ]),
    from: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    cue: Type.String({ minLength: 1 })
}, closed);

export const BundleNavigationPlacementSchema = Type.Union([
    Type.Literal("primary"),
    Type.Literal("secondary"),
    Type.Literal("footer"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
]);

export const SupportingRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("supporting"),
    navigation: Type.Optional(BundleNavigationPlacementSchema),
    content: BundlePageContentSchema,
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

export const StructuralRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("structural"),
    navigation: Type.Optional(BundleNavigationPlacementSchema),
    content: BundlePageContentSchema,
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

export const PuzzleRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("puzzle"),
    navigation: Type.Optional(BundleNavigationPlacementSchema),
    content: BundlePageContentSchema,
    puzzleId: Type.String({ minLength: 1 }),
    placement: BundlePlacementStrategySchema,
    directAssetPath: Type.Optional(Type.String({ minLength: 1 })),
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

export const TerminalRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("terminal"),
    navigation: Type.Optional(BundleNavigationPlacementSchema),
    content: BundlePageContentSchema,
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

export const BundleRouteSchema = Type.Union([
    SupportingRouteSchema,
    StructuralRouteSchema,
    PuzzleRouteSchema,
    TerminalRouteSchema
]);

export const BundledSiteSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    worldEntityId: Type.Optional(Type.String({ minLength: 1 })),
    archetype: BundleSiteArchetypeSchema,
    visualProfile: BundleSiteVisualProfileSchema,
    basePath: Type.String({ minLength: 1 }),
    routes: Type.Array(BundleRouteSchema, { minItems: 1 })
}, closed);

export const LevelBundleSchema = Type.Object({
    schemaVersion: Type.Literal(LEVEL_BUNDLE_SCHEMA_VERSION),
    levelId: Type.String({ minLength: 1 }),
    world: Type.Object({
        id: Type.String({ minLength: 1 }),
        revision: Type.String({ minLength: 1 }),
        asOf: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))
    }, closed),
    seed: Type.String({ minLength: 1 }),
    worldAdditions: BundleWorldAdditionsSchema,
    mediaRequests: Type.Array(SupportingMediaRequestSchema),
    sites: Type.Array(BundledSiteSchema, { minItems: 1 }),
    terminal: Type.Object({
        siteId: Type.String({ minLength: 1 }),
        routePath: Type.String({ minLength: 1 }),
        mode: Type.Union([Type.Literal("static-preview"), Type.Literal("validation-api")])
    }, closed)
}, closed);

export type BundlePlacement = Static<typeof BundlePlacementStrategySchema>;
export type BundleSiteArchetype = Static<typeof BundleSiteArchetypeSchema>;
export type BundleContentBlock = Static<typeof BundleContentBlockSchema>;
export type BundlePageContent = Static<typeof BundlePageContentSchema>;
export type BundleSiteVisualProfile = Static<typeof BundleSiteVisualProfileSchema>;
export type SupportingMediaRequest = Static<typeof SupportingMediaRequestSchema>;
export type BundleWorldAdditions = Static<typeof BundleWorldAdditionsSchema>;
export type BundleDiscovery = Static<typeof BundleDiscoverySchema>;
export type BundleRoute = Static<typeof BundleRouteSchema>;
export type BundledSite = Static<typeof BundledSiteSchema>;
export type LevelBundle = Static<typeof LevelBundleSchema>;

function duplicateValues(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
}

function safePublicPath(value: string): boolean {
    if (!value.startsWith("/") || value.includes("\\") || value.includes("?") || value.includes("#")) {
        return false;
    }
    if (value !== "/" && value.endsWith("/")) return false;
    if (value.includes("//")) return false;
    return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

function fullRoutePath(basePath: string, routePath: string): string {
    if (basePath === "/") return routePath;
    if (routePath === "/") return basePath;
    return `${basePath}${routePath}`;
}

export function validateLevelBundle(
    value: unknown,
    level: LevelBlueprint,
    catalog: PuzzleCatalog,
    world?: GameWorld
): string[] {
    if (!Value.Check(LevelBundleSchema, value)) {
        return ["Level bundle does not satisfy the canonical schema."];
    }
    const bundle = value as LevelBundle;
    const errors: string[] = [];

    if (bundle.levelId !== level.id) {
        errors.push(`Bundle level ID ${bundle.levelId} does not match level ${level.id}.`);
    }
    if (bundle.world.id !== level.world.id || bundle.world.revision !== level.world.revision) {
        errors.push("Bundle world ID and revision must match the level world reference.");
    }
    if (bundle.world.asOf !== level.world.asOf) {
        errors.push("Bundle world asOf date must match the level world reference.");
    }

    for (const duplicate of duplicateValues(bundle.sites.map((site) => site.id))) {
        errors.push(`Duplicate bundled site ID: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(bundle.sites.map((site) => site.basePath))) {
        errors.push(`Duplicate bundled site base path: ${duplicate}.`);
    }

    const baseEntityIds = new Set((world?.entities ?? []).map((entity) => entity.id));
    if (world === undefined) {
        for (const entityId of level.world.entityIds) baseEntityIds.add(entityId);
    }
    const addedEntityIds = bundle.worldAdditions.entities.map((entity) => entity.id);
    const addedFactIds = bundle.worldAdditions.facts.map((fact) => fact.id);
    for (const duplicate of duplicateValues(addedEntityIds)) {
        errors.push(`Duplicate proposed world-entity ID: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(addedFactIds)) {
        errors.push(`Duplicate proposed world-fact ID: ${duplicate}.`);
    }
    for (const entityId of addedEntityIds) {
        if (baseEntityIds.has(entityId)) errors.push(`Proposed world entity ${entityId} already exists.`);
    }
    const baseFactIds = new Set((world?.facts ?? []).map((fact) => fact.id));
    for (const factId of addedFactIds) {
        if (baseFactIds.has(factId)) errors.push(`Proposed world fact ${factId} already exists.`);
    }
    const availableWorldEntities = new Set([...baseEntityIds, ...addedEntityIds]);
    for (const fact of bundle.worldAdditions.facts) {
        if (!availableWorldEntities.has(fact.subjectId)) {
            errors.push(`Proposed world fact ${fact.id} references missing subject ${fact.subjectId}.`);
        }
        if (fact.value.kind === "entity" && !availableWorldEntities.has(fact.value.entityId)) {
            errors.push(`Proposed world fact ${fact.id} references missing entity ${fact.value.entityId}.`);
        }
    }

    for (const duplicate of duplicateValues(bundle.mediaRequests.map((request) => request.id))) {
        errors.push(`Duplicate supporting-media request ID: ${duplicate}.`);
    }

    const fullPaths: string[] = [];
    const directAssetPaths: string[] = [];
    const routeByFullPath = new Map<string, BundleRoute>();
    const placedPuzzleIds: string[] = [];
    const terminalRoutes: Array<{ siteId: string; path: string }> = [];
    const levelPuzzleIds = new Set(level.puzzles.map((puzzle) => puzzle.id));
    const selectedWorldEntities = new Set([...level.world.entityIds, ...addedEntityIds]);
    const mediaBlockLocations = new Map<string, Array<{ siteId: string; routePath: string }>>();

    for (const site of bundle.sites) {
        if (!safePublicPath(site.basePath)) {
            errors.push(`Bundled site ${site.id} has unsafe base path ${site.basePath}.`);
        }
        if (site.worldEntityId !== undefined && !selectedWorldEntities.has(site.worldEntityId)) {
            errors.push(`Bundled site ${site.id} references world entity ${site.worldEntityId} outside the level context.`);
        }
        for (const duplicate of duplicateValues(site.routes.map((route) => route.path))) {
            errors.push(`Bundled site ${site.id} has duplicate route path ${duplicate}.`);
        }
        for (const route of site.routes) {
            if (!safePublicPath(route.path)) {
                errors.push(`Bundled site ${site.id} has unsafe route path ${route.path}.`);
            }
            const publicPath = fullRoutePath(site.basePath, route.path);
            fullPaths.push(publicPath);
            routeByFullPath.set(publicPath, route);
            for (const block of route.content.blocks) {
                if (block.kind === "table") {
                    for (const [index, row] of block.rows.entries()) {
                        if (row.length !== block.columns.length) {
                            errors.push(
                                `Table row ${index + 1} on ${publicPath} has ${row.length} cells; `
                                + `expected ${block.columns.length}.`
                            );
                        }
                    }
                }
                if (block.kind === "cards") {
                    for (const item of block.items) {
                        if (item.href !== undefined && !safePublicPath(item.href)) {
                            errors.push(`Card on ${publicPath} has unsafe link ${item.href}.`);
                        }
                    }
                }
                if (block.kind === "media") {
                    const locations = mediaBlockLocations.get(block.mediaId) ?? [];
                    locations.push({ siteId: site.id, routePath: route.path });
                    mediaBlockLocations.set(block.mediaId, locations);
                }
            }
            if (route.role === "terminal") terminalRoutes.push({ siteId: site.id, path: route.path });
            if (route.role !== "puzzle") continue;

            placedPuzzleIds.push(route.puzzleId);
            const puzzle = level.puzzles.find((candidate) => candidate.id === route.puzzleId);
            if (puzzle === undefined) {
                errors.push(`Bundle places unknown puzzle ${route.puzzleId}.`);
                continue;
            }
            const entry = getPuzzleCatalogEntry(catalog, puzzle.design.subtype);
            if (entry === undefined) {
                errors.push(`Puzzle ${route.puzzleId} has no catalog entry for subtype ${puzzle.design.subtype}.`);
            } else if (!entry.bundle.placements.includes(route.placement as BundlePlacementStrategy)) {
                errors.push(
                    `Puzzle ${route.puzzleId} cannot use ${route.placement}; ` +
                    `allowed placements are ${entry.bundle.placements.join(", ")}.`
                );
            }
            if (route.directAssetPath !== undefined && !safePublicPath(route.directAssetPath)) {
                errors.push(`Puzzle ${route.puzzleId} has unsafe direct asset path ${route.directAssetPath}.`);
            }
            if ((route.placement === "media-viewer" || route.placement === "downloadable-file")
                && route.directAssetPath === undefined) {
                errors.push(`Puzzle ${route.puzzleId} requires a direct asset path for ${route.placement} placement.`);
            }
            if (route.directAssetPath !== undefined) directAssetPaths.push(route.directAssetPath);
        }
    }

    for (const duplicate of duplicateValues(fullPaths)) {
        errors.push(`Duplicate public route path: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(directAssetPaths)) {
        errors.push(`Duplicate direct asset path: ${duplicate}.`);
    }
    for (const assetPath of directAssetPaths) {
        if (fullPaths.includes(assetPath)) errors.push(`Direct asset path ${assetPath} conflicts with a public page route.`);
    }

    const sitesById = new Map(bundle.sites.map((site) => [site.id, site]));
    const requestsById = new Map(bundle.mediaRequests.map((request) => [request.id, request]));
    for (const request of bundle.mediaRequests) {
        const site = sitesById.get(request.siteId);
        if (site === undefined) {
            errors.push(`Supporting-media request ${request.id} references missing site ${request.siteId}.`);
        } else if (!site.routes.some((route) => route.path === request.routePath)) {
            errors.push(
                `Supporting-media request ${request.id} references missing route ${request.routePath} `
                + `on site ${request.siteId}.`
            );
        }
        for (const duplicate of duplicateValues(request.worldEntityIds)) {
            errors.push(`Supporting-media request ${request.id} repeats world entity ${duplicate}.`);
        }
        for (const entityId of request.worldEntityIds) {
            if (!availableWorldEntities.has(entityId)) {
                errors.push(`Supporting-media request ${request.id} references missing world entity ${entityId}.`);
            }
        }
        const locations = mediaBlockLocations.get(request.id) ?? [];
        if (locations.length === 0) {
            errors.push(`Supporting-media request ${request.id} is not placed in page content.`);
        }
        for (const location of locations) {
            if (location.siteId !== request.siteId || location.routePath !== request.routePath) {
                errors.push(
                    `Supporting-media request ${request.id} is placed on ${location.siteId}${location.routePath}, `
                    + `not its declared route ${request.siteId}${request.routePath}.`
                );
            }
        }
    }
    for (const mediaId of mediaBlockLocations.keys()) {
        if (!requestsById.has(mediaId)) errors.push(`Page content references missing supporting media ${mediaId}.`);
    }

    const startingSources = new Set(level.startingInputs.map((input) => `starting-input:${input.id}`));
    for (const [publicPath, route] of routeByFullPath) {
        if (route.path !== "/" && route.discovery === undefined) {
            errors.push(`Route ${publicPath} must declare how it is discovered.`);
            continue;
        }
        for (const source of route.discovery?.from ?? []) {
            if (!startingSources.has(source) && !routeByFullPath.has(source)) {
                errors.push(`Route ${publicPath} has unknown discovery source ${source}.`);
            }
            if (source === publicPath) errors.push(`Route ${publicPath} cannot discover itself.`);
        }
    }

    const reachable = new Set<string>();
    for (const [publicPath, route] of routeByFullPath) {
        if (route.path === "/" || route.discovery?.from.some((source) => startingSources.has(source))) {
            reachable.add(publicPath);
        }
    }
    let changed = true;
    while (changed) {
        changed = false;
        for (const [publicPath, route] of routeByFullPath) {
            if (reachable.has(publicPath)) continue;
            if (route.discovery?.from.some((source) => reachable.has(source))) {
                reachable.add(publicPath);
                changed = true;
            }
        }
    }
    for (const [publicPath, route] of routeByFullPath) {
        if ((route.role === "puzzle" || route.role === "terminal") && !reachable.has(publicPath)) {
            errors.push(`Required route ${publicPath} is not reachable from a starting input or site root.`);
        }
    }
    for (const duplicate of duplicateValues(placedPuzzleIds)) {
        errors.push(`Puzzle ${duplicate} is placed more than once.`);
    }
    for (const puzzleId of levelPuzzleIds) {
        if (!placedPuzzleIds.includes(puzzleId)) errors.push(`Puzzle ${puzzleId} is not placed in the bundle.`);
    }

    if (terminalRoutes.length !== 1) {
        errors.push(`Bundle must contain exactly one terminal route; found ${terminalRoutes.length}.`);
    }
    const terminalSite = bundle.sites.find((site) => site.id === bundle.terminal.siteId);
    const terminalRoute = terminalSite?.routes.find((route) => route.path === bundle.terminal.routePath);
    if (terminalRoute?.role !== "terminal") {
        errors.push("Bundle terminal reference must identify its terminal route.");
    }
    return errors;
}

export function assertLevelBundle(
    value: unknown,
    level: LevelBlueprint,
    catalog: PuzzleCatalog,
    world?: GameWorld
): asserts value is LevelBundle {
    const errors = validateLevelBundle(value, level, catalog, world);
    if (errors.length > 0) throw new Error(`Invalid level bundle:\n- ${errors.join("\n- ")}`);
}
