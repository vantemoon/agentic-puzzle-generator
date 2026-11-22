import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { safeArtifactFileStem } from "./html-preview.js";
import { getWavAudioData, type PrivatePuzzleInstance } from "./types.js";

export interface AudioArtifactPreview {
    path: string;
    fileUrl: string;
}

export async function writeWavAudioArtifactPreview(options: {
    puzzle: PrivatePuzzleInstance;
    artifactDirectoryName: string;
    fallbackFileStem?: string;
}): Promise<AudioArtifactPreview> {
    if (options.puzzle.artifact.kind !== "audio" || options.puzzle.artifact.mediaType !== "audio/wav") {
        throw new Error("Only WAV audio artifacts can be exported as WAV previews.");
    }

    const previewDirectory = path.join(process.cwd(), "generated-artifacts", options.artifactDirectoryName);
    await mkdir(previewDirectory, { recursive: true });

    const fileStem = safeArtifactFileStem(
        options.puzzle.id,
        options.fallbackFileStem ?? `${options.artifactDirectoryName}-preview`
    );
    const absolutePath = path.join(previewDirectory, `${fileStem}.wav`);
    await writeFile(absolutePath, Buffer.from(getWavAudioData(options.puzzle.artifact), "base64"));

    return {
        path: path.relative(process.cwd(), absolutePath),
        fileUrl: pathToFileURL(absolutePath).href
    };
}
