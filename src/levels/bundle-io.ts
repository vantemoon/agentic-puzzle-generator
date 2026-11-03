import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PuzzleCatalog } from "./catalog.js";
import {
    assertLevelBundle,
    LEVEL_BUNDLE_SCHEMA_VERSION,
    type BundleSiteArchetype,
    type BundleSiteVisualProfile,
    type LevelBundle
} from "./bundle.js";
import type { LevelBlueprint } from "./types.js";
import type { GameWorld } from "../world/types.js";

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Level ID cannot be converted to a safe filename.");
    return stem;
}

export function levelBundlePlanPath(levelId: string, rootDirectory = "generated-bundles"): string {
    return path.resolve(rootDirectory, safeFileStem(levelId), "level.bundle.json");
}

export async function writeLevelBundleFile(options: {
    bundle: LevelBundle;
    level: LevelBlueprint;
    catalog: PuzzleCatalog;
    world?: GameWorld;
    outputDirectory?: string;
}): Promise<string> {
    assertLevelBundle(options.bundle, options.level, options.catalog, options.world);
    const outputPath = levelBundlePlanPath(options.level.id, options.outputDirectory);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(options.bundle, null, 2)}\n`, "utf8");
    return outputPath;
}

function legacyVisualProfile(archetype: BundleSiteArchetype): BundleSiteVisualProfile {
    const profiles: Record<BundleSiteArchetype, BundleSiteVisualProfile> = {
        blog: { tone: "artistic", fontStyle: "mixed", density: "comfortable", accentColor: "#8a4b36", mediaStyle: "Personal editorial photography and artwork" },
        organization: { tone: "warm", fontStyle: "sans", density: "comfortable", accentColor: "#245b78", mediaStyle: "Natural community documentary photography" },
        gallery: { tone: "artistic", fontStyle: "serif", density: "spacious", accentColor: "#6d416d", mediaStyle: "Carefully lit gallery and collection imagery" },
        records: { tone: "formal", fontStyle: "serif", density: "compact", accentColor: "#4c5d6b", mediaStyle: "Documentary archival scans and civic records" },
        directory: { tone: "neutral", fontStyle: "sans", density: "compact", accentColor: "#356b55", mediaStyle: "Clear local business and profile photography" },
        "version-history": { tone: "formal", fontStyle: "mono-accent", density: "compact", accentColor: "#555f7a", mediaStyle: "Archival document and interface imagery" },
        "audio-archive": { tone: "neutral", fontStyle: "sans", density: "comfortable", accentColor: "#765285", mediaStyle: "Broadcast archive artwork and recording ephemera" },
        database: { tone: "formal", fontStyle: "mono-accent", density: "compact", accentColor: "#315d72", mediaStyle: "Functional records, diagrams, and identity marks" },
        generic: { tone: "neutral", fontStyle: "sans", density: "comfortable", accentColor: "#245b78", mediaStyle: "Realistic editorial supporting imagery" }
    };
    return profiles[archetype];
}

function upgradeLegacyBundle(value: unknown): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    const legacy = value as Record<string, unknown>;
    if (legacy.schemaVersion !== "1.0.0" || !Array.isArray(legacy.sites)) return value;
    return {
        ...legacy,
        schemaVersion: LEVEL_BUNDLE_SCHEMA_VERSION,
        worldAdditions: { entities: [], facts: [] },
        mediaRequests: [],
        sites: legacy.sites.map((siteValue) => {
            const site = siteValue as Record<string, unknown>;
            const archetype = site.archetype as BundleSiteArchetype;
            return {
                ...site,
                visualProfile: legacyVisualProfile(archetype),
                routes: Array.isArray(site.routes) ? site.routes.map((routeValue) => {
                    const route = routeValue as Record<string, unknown>;
                    const content = route.content as Record<string, unknown>;
                    return {
                        ...route,
                        content: {
                            title: content.title,
                            description: content.description,
                            blocks: [{ kind: "prose", paragraphs: content.body }]
                        }
                    };
                }) : site.routes
            };
        })
    };
}

export async function readLevelBundleFile(options: {
    filePath: string;
    level: LevelBlueprint;
    catalog: PuzzleCatalog;
    world?: GameWorld;
}): Promise<LevelBundle> {
    const parsed = JSON.parse(await readFile(path.resolve(options.filePath), "utf8")) as unknown;
    const value = upgradeLegacyBundle(parsed);
    assertLevelBundle(value, options.level, options.catalog, options.world);
    return value;
}
