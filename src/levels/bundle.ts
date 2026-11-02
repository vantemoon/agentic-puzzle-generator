import Type, { type Static } from "typebox";
import Value from "typebox/value";

import {
    getPuzzleCatalogEntry,
    type BundlePlacementStrategy,
    type PuzzleCatalog
} from "./catalog.js";
import type { LevelBlueprint } from "./types.js";

const closed = { additionalProperties: false } as const;

export const LEVEL_BUNDLE_SCHEMA_VERSION = "1.0.0";

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

export const BundlePageContentSchema = Type.Object({
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    body: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
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

const SupportingRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Union([Type.Literal("supporting"), Type.Literal("structural")]),
    content: BundlePageContentSchema,
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

const PuzzleRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("puzzle"),
    content: BundlePageContentSchema,
    puzzleId: Type.String({ minLength: 1 }),
    placement: BundlePlacementStrategySchema,
    directAssetPath: Type.Optional(Type.String({ minLength: 1 })),
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

const TerminalRouteSchema = Type.Object({
    path: Type.String({ minLength: 1 }),
    role: Type.Literal("terminal"),
    content: BundlePageContentSchema,
    discovery: Type.Optional(BundleDiscoverySchema)
}, closed);

export const BundleRouteSchema = Type.Union([
    SupportingRouteSchema,
    PuzzleRouteSchema,
    TerminalRouteSchema
]);

export const BundledSiteSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    worldEntityId: Type.Optional(Type.String({ minLength: 1 })),
    archetype: BundleSiteArchetypeSchema,
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
    sites: Type.Array(BundledSiteSchema, { minItems: 1 }),
    terminal: Type.Object({
        siteId: Type.String({ minLength: 1 }),
        routePath: Type.String({ minLength: 1 }),
        mode: Type.Union([Type.Literal("static-preview"), Type.Literal("validation-api")])
    }, closed)
}, closed);

export type BundlePlacement = Static<typeof BundlePlacementStrategySchema>;
export type BundleSiteArchetype = Static<typeof BundleSiteArchetypeSchema>;
export type BundlePageContent = Static<typeof BundlePageContentSchema>;
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
    catalog: PuzzleCatalog
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

    const fullPaths: string[] = [];
    const directAssetPaths: string[] = [];
    const routeByFullPath = new Map<string, BundleRoute>();
    const placedPuzzleIds: string[] = [];
    const terminalRoutes: Array<{ siteId: string; path: string }> = [];
    const levelPuzzleIds = new Set(level.puzzles.map((puzzle) => puzzle.id));
    const selectedWorldEntities = new Set(level.world.entityIds);

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
    catalog: PuzzleCatalog
): asserts value is LevelBundle {
    const errors = validateLevelBundle(value, level, catalog);
    if (errors.length > 0) throw new Error(`Invalid level bundle:\n- ${errors.join("\n- ")}`);
}
