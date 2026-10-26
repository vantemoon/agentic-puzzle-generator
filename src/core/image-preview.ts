import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { safeArtifactFileStem } from "./html-preview.js";
import { getPngImageData, getSvgImageSource, type PrivatePuzzleInstance } from "./types.js";

export interface ImageArtifactPreview {
    path: string;
    fileUrl: string;
}

async function writeImageArtifactPreviewFile(options: {
    puzzle: PrivatePuzzleInstance;
    artifactDirectoryName: string;
    fallbackFileStem?: string;
    extension: "svg" | "png";
    contents: string | Buffer;
}): Promise<ImageArtifactPreview> {
    const previewDirectory = path.join(process.cwd(), "generated-artifacts", options.artifactDirectoryName);
    await mkdir(previewDirectory, { recursive: true });

    const fileStem = safeArtifactFileStem(
        options.puzzle.id,
        options.fallbackFileStem ?? `${options.artifactDirectoryName}-preview`
    );
    const absolutePath = path.join(previewDirectory, `${fileStem}.${options.extension}`);
    await writeFile(absolutePath, options.contents);

    return {
        path: path.relative(process.cwd(), absolutePath),
        fileUrl: pathToFileURL(absolutePath).href
    };
}

export async function writeSvgImageArtifactPreview(options: {
    puzzle: PrivatePuzzleInstance;
    artifactDirectoryName: string;
    fallbackFileStem?: string;
}): Promise<ImageArtifactPreview> {
    if (options.puzzle.artifact.kind !== "image" || options.puzzle.artifact.mediaType !== "image/svg+xml") {
        throw new Error("Only SVG image artifacts can be exported as SVG previews.");
    }

    return writeImageArtifactPreviewFile({
        puzzle: options.puzzle,
        artifactDirectoryName: options.artifactDirectoryName,
        fallbackFileStem: options.fallbackFileStem,
        extension: "svg",
        contents: getSvgImageSource(options.puzzle.artifact)
    });
}

export async function writePngImageArtifactPreview(options: {
    puzzle: PrivatePuzzleInstance;
    artifactDirectoryName: string;
    fallbackFileStem?: string;
}): Promise<ImageArtifactPreview> {
    if (options.puzzle.artifact.kind !== "image" || options.puzzle.artifact.mediaType !== "image/png") {
        throw new Error("Only PNG image artifacts can be exported as PNG previews.");
    }

    return writeImageArtifactPreviewFile({
        puzzle: options.puzzle,
        artifactDirectoryName: options.artifactDirectoryName,
        fallbackFileStem: options.fallbackFileStem,
        extension: "png",
        contents: Buffer.from(getPngImageData(options.puzzle.artifact), "base64")
    });
}
