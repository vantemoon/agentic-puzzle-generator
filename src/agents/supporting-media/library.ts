import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import Type, { type Static } from "typebox";
import Value from "typebox/value";

const closed = { additionalProperties: false } as const;

export const WORLD_MEDIA_LIBRARY_SCHEMA_VERSION = "1.0.0";

const WorldMediaAssetSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    kind: Type.Union([
        Type.Literal("raster-image"),
        Type.Literal("svg"),
        Type.Literal("document")
    ]),
    mediaType: Type.Union([
        Type.Literal("image/png"),
        Type.Literal("image/svg+xml"),
        Type.Literal("text/html")
    ]),
    file: Type.String({ minLength: 1 }),
    sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    worldEntityIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    purpose: Type.String({ minLength: 1 }),
    accessibilityText: Type.String({ minLength: 1 }),
    source: Type.Object({
        levelId: Type.String({ minLength: 1 }),
        siteId: Type.String({ minLength: 1 }),
        routePath: Type.String({ minLength: 1 })
    }, closed),
    generator: Type.Object({
        task: Type.Union([
            Type.Literal("supporting-media-raster"),
            Type.Literal("supporting-media-svg"),
            Type.Literal("supporting-media-document")
        ]),
        modelId: Type.String({ minLength: 1 }),
        providerId: Type.String({ minLength: 1 })
    }, closed)
}, closed);

const WorldMediaLibrarySchema = Type.Object({
    schemaVersion: Type.Literal(WORLD_MEDIA_LIBRARY_SCHEMA_VERSION),
    worldId: Type.String({ minLength: 1 }),
    assets: Type.Array(WorldMediaAssetSchema)
}, closed);

export type WorldMediaAsset = Static<typeof WorldMediaAssetSchema>;
export type WorldMediaLibrary = Static<typeof WorldMediaLibrarySchema>;

export interface GeneratedSupportingMedia {
    mediaType: WorldMediaAsset["mediaType"];
    encoding: "utf8" | "base64";
    data: string;
}

function safeFileStem(value: string): string {
    const stem = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Supporting-media ID cannot be converted to a safe filename.");
    return stem;
}

function extension(mediaType: WorldMediaAsset["mediaType"]): string {
    if (mediaType === "image/png") return "png";
    if (mediaType === "image/svg+xml") return "svg";
    return "html";
}

function assertLibrary(value: unknown): asserts value is WorldMediaLibrary {
    if (!Value.Check(WorldMediaLibrarySchema, value)) {
        throw new Error("World media library does not satisfy the canonical schema.");
    }
    const library = value as WorldMediaLibrary;
    const ids = library.assets.map((asset) => asset.id);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate !== undefined) throw new Error(`World media library repeats asset ${duplicate}.`);
    for (const asset of library.assets) {
        if (path.isAbsolute(asset.file) || asset.file.includes("\\")
            || asset.file.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
            throw new Error(`World media asset ${asset.id} has unsafe file path ${asset.file}.`);
        }
    }
}

export function worldMediaDirectory(worldId: string, rootDirectory = "generated-world-media"): string {
    return path.resolve(rootDirectory, safeFileStem(worldId));
}

export function worldMediaLibraryPath(worldId: string, rootDirectory = "generated-world-media"): string {
    return path.join(worldMediaDirectory(worldId, rootDirectory), "media-library.json");
}

export async function readWorldMediaLibrary(
    worldId: string,
    rootDirectory = "generated-world-media"
): Promise<WorldMediaLibrary> {
    const filePath = worldMediaLibraryPath(worldId, rootDirectory);
    try {
        const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
        assertLibrary(value);
        if (value.worldId !== worldId) {
            throw new Error(`World media library belongs to ${value.worldId}, not ${worldId}.`);
        }
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { schemaVersion: WORLD_MEDIA_LIBRARY_SCHEMA_VERSION, worldId, assets: [] };
        }
        throw error;
    }
}

export async function writeWorldMediaAsset(options: {
    worldId: string;
    rootDirectory?: string;
    asset: Omit<WorldMediaAsset, "file" | "sha256">;
    generated: GeneratedSupportingMedia;
}): Promise<WorldMediaAsset> {
    const rootDirectory = options.rootDirectory ?? "generated-world-media";
    const library = await readWorldMediaLibrary(options.worldId, rootDirectory);
    if (library.assets.some((asset) => asset.id === options.asset.id)) {
        throw new Error(`World media asset ${options.asset.id} already exists.`);
    }
    if (options.asset.mediaType !== options.generated.mediaType) {
        throw new Error(`Generated media type ${options.generated.mediaType} does not match ${options.asset.mediaType}.`);
    }
    const bytes = options.generated.encoding === "base64"
        ? Buffer.from(options.generated.data, "base64")
        : Buffer.from(options.generated.data, "utf8");
    const relativeFile = `assets/${safeFileStem(options.asset.id)}.${extension(options.generated.mediaType)}`;
    if (library.assets.some((asset) => asset.file === relativeFile)) {
        throw new Error(`World media asset ${options.asset.id} conflicts with existing file ${relativeFile}.`);
    }
    const outputDirectory = worldMediaDirectory(options.worldId, rootDirectory);
    const outputPath = path.join(outputDirectory, relativeFile);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
    const asset: WorldMediaAsset = {
        ...options.asset,
        file: relativeFile,
        sha256: createHash("sha256").update(bytes).digest("hex")
    };
    const updated: WorldMediaLibrary = {
        ...library,
        assets: [...library.assets, asset].sort((left, right) => left.id.localeCompare(right.id))
    };
    assertLibrary(updated);
    await writeFile(worldMediaLibraryPath(options.worldId, rootDirectory), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return asset;
}

export async function readWorldMediaAsset(options: {
    worldId: string;
    asset: WorldMediaAsset;
    rootDirectory?: string;
}): Promise<Buffer> {
    const rootDirectory = options.rootDirectory ?? "generated-world-media";
    const root = worldMediaDirectory(options.worldId, rootDirectory);
    const filePath = path.resolve(root, options.asset.file);
    if (path.relative(root, filePath).startsWith("..")) {
        throw new Error(`World media asset ${options.asset.id} escapes its library directory.`);
    }
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`World media asset ${options.asset.id} is not a file.`);
    const bytes = await readFile(filePath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== options.asset.sha256) {
        throw new Error(`World media asset ${options.asset.id} does not match its library hash.`);
    }
    return bytes;
}
