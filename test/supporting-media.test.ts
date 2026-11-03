import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeRgbaPng } from "../src/agents/channel-clue/png.js";
import {
    generateDocumentMedia,
    generateRasterMedia,
    generateSvgMedia
} from "../src/agents/supporting-media/engine.js";
import {
    readWorldMediaAsset,
    readWorldMediaLibrary,
    writeWorldMediaAsset
} from "../src/agents/supporting-media/library.js";
import { createSupportingMediaTool } from "../src/agents/supporting-media/tool.js";
import type { SupportingMediaRequest } from "../src/levels/bundle.js";

const REQUEST: SupportingMediaRequest = {
    id: "library-mark",
    siteId: "library",
    routePath: "/",
    kind: "svg",
    purpose: "Identify the fictional library website",
    brief: "A simple civic library mark based on an open book",
    accessibilityText: "Open-book mark for the fictional library",
    worldEntityIds: ["organization:library"]
};

describe("supporting media generation", () => {
    it("compiles raster instructions into a real PNG", () => {
        const generated = generateRasterMedia({
            backgroundColor: "#d7e1e5",
            elements: [
                "rect|80|70|480|240|#d2c7b5|1|12",
                "circle|320|135|42|#8c6b52|0.9",
                "line|120|290|520|290|#485963|8|1"
            ]
        });
        expect(generated.mediaType).toBe("image/png");
        expect(decodeRgbaPng(generated.data)).toMatchObject({ width: 640, height: 360 });
    });

    it("compiles safe SVG branding and escaped HTML documents", () => {
        const svg = generateSvgMedia({
            title: "Library mark",
            description: "An open book symbol",
            elements: [
                "rect|120|100|720|340|#f4efe2|#445566|8|1|24|24",
                "text|480|300|72|#445566|middle|serif|Riverside Library"
            ]
        });
        expect(svg.data).toContain("<svg");
        expect(svg.data).not.toContain("<script");

        const document = generateDocumentMedia({
            title: "Visitor <Guide>",
            sections: [{
                heading: "Hours",
                records: [{ label: "Monday", value: "9:00–17:00" }]
            }],
            accentColor: "#315d72"
        });
        expect(document.mediaType).toBe("text/html");
        expect(document.data).toContain("Visitor &lt;Guide&gt;");
        expect(document.data).not.toContain("Visitor <Guide>");
    });

    it("rejects puzzle answers in generated public media", async () => {
        const tool = createSupportingMediaTool(REQUEST, ["SECRET ANSWER"]);
        await expect(tool.execute("tool", {
            kind: "svg",
            title: "SECRET ANSWER",
            description: "Library mark",
            elements: ["circle|100|100|50|#334455|none|0|1"]
        })).rejects.toThrow("must not contain a puzzle answer");
    });

    it("writes, reads, and verifies reusable world media assets", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "world-media-"));
        const generated = generateSvgMedia({
            title: "Library mark",
            description: "An open book",
            elements: ["circle|100|100|50|#334455|none|0|1"]
        });
        const asset = await writeWorldMediaAsset({
            worldId: "test-world",
            rootDirectory: root,
            generated,
            asset: {
                id: REQUEST.id,
                kind: REQUEST.kind,
                mediaType: "image/svg+xml",
                worldEntityIds: REQUEST.worldEntityIds,
                purpose: REQUEST.purpose,
                accessibilityText: REQUEST.accessibilityText,
                source: { levelId: "level-1", siteId: REQUEST.siteId, routePath: REQUEST.routePath },
                generator: {
                    task: "supporting-media-svg",
                    modelId: "test-model",
                    providerId: "test-provider"
                }
            }
        });

        const library = await readWorldMediaLibrary("test-world", root);
        expect(library.assets).toEqual([asset]);
        await expect(readWorldMediaAsset({
            worldId: "test-world",
            rootDirectory: root,
            asset
        })).resolves.toEqual(Buffer.from(generated.data, "utf8"));

        const assetPath = path.join(root, "test-world", asset.file);
        await mkdir(path.dirname(assetPath), { recursive: true });
        await writeFile(assetPath, `${await readFile(assetPath, "utf8")} changed`, "utf8");
        await expect(readWorldMediaAsset({
            worldId: "test-world",
            rootDirectory: root,
            asset
        })).rejects.toThrow("does not match its library hash");
    });
});
