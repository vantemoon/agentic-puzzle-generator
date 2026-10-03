import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getHtmlEntryFile, type PrivatePuzzleInstance } from "./types.js";

export interface HtmlArtifactPreviewFile {
    path: string;
    previewPath: string;
    previewUrl: string;
}

export interface HtmlArtifactPreview {
    path: string;
    fileUrl: string;
    directory: string;
    entryPath: string;
    files: HtmlArtifactPreviewFile[];
}

export function safeArtifactFileStem(input: string, fallback = "html-preview"): string {
    const normalized = input.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized.length === 0 ? fallback : normalized;
}

export async function writeHtmlArtifactPreview(options: {
    puzzle: PrivatePuzzleInstance;
    artifactDirectoryName: string;
    fallbackFileStem?: string;
}): Promise<HtmlArtifactPreview> {
    if (options.puzzle.artifact.kind !== "html") {
        throw new Error("Only HTML artifacts can be exported as HTML previews.");
    }

    const previewRoot = path.join(
        process.cwd(),
        "generated-artifacts",
        options.artifactDirectoryName,
        safeArtifactFileStem(
            options.puzzle.id,
            options.fallbackFileStem ?? `${options.artifactDirectoryName}-preview`
        )
    );
    await mkdir(previewRoot, { recursive: true });

    const previews: HtmlArtifactPreviewFile[] = [];
    for (const file of options.puzzle.artifact.files) {
        const relativeFilePath = file.path.replace(/^\/+/, "");
        if (relativeFilePath.length === 0 || relativeFilePath.includes("..") || relativeFilePath.includes("\\")) {
            throw new Error("HTML artifact file paths must be safe relative web paths.");
        }
        const absolutePath = path.join(previewRoot, relativeFilePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, file.source, "utf8");
        previews.push({
            path: file.path,
            previewPath: path.relative(process.cwd(), absolutePath),
            previewUrl: pathToFileURL(absolutePath).href
        });
    }

    const entryFile = getHtmlEntryFile(options.puzzle.artifact);
    const entryPreview = previews.find((file) => file.path === entryFile.path);
    if (entryPreview === undefined) {
        throw new Error("HTML artifact preview must include the entry file.");
    }

    return {
        path: entryPreview.previewPath,
        fileUrl: entryPreview.previewUrl,
        directory: path.relative(process.cwd(), previewRoot),
        entryPath: options.puzzle.artifact.entryPath,
        files: previews
    };
}
