import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type { ImageContent } from "@earendil-works/pi-ai";

import type { PublicBundleManifest } from "../level-bundle/build.js";

export interface LevelEvidence {
    title: string;
    paths: Set<string>;
    content: Array<{ path: string; text: string }>;
    images: Array<{ path: string; content: ImageContent }>;
    unrendered: string[];
}

function cleanText(value: string): string {
    const entities: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " "
    };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
        if (code[0] !== "#") return entities[code.toLowerCase()] ?? entity;
        const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }).replace(/[^\S\n]+/g, " ").replace(/ *\n+ */g, "\n").trim();
}

function textContent(markup: string): string {
    return cleanText(markup.replace(/<[^>]+>/g, " "));
}

function svgText(svg: string): string {
    return [...svg.replace(/<!--[\s\S]*?-->/g, "")
        .matchAll(/<text\b[^>]*>([\s\S]*?)<\/text\s*>/gi)]
        .map((match) => textContent(match[1])).join(" | ");
}

function embeddedMediaText(source: string): string {
    const comma = source.indexOf(",");
    if (!source.startsWith("data:image/svg+xml") || comma < 0) return "embedded media";
    const data = source.slice(comma + 1);
    try {
        const svg = source.slice(0, comma).includes(";base64")
            ? Buffer.from(data, "base64").toString("utf8")
            : decodeURIComponent(data);
        const labels = svgText(svg);
        return labels ? `embedded SVG text: ${labels}` : "embedded SVG";
    } catch {
        return "embedded SVG";
    }
}

export function playerPageText(html: string): string {
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
    return cleanText(body
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<(\w+)\b[^>]*\s(?:hidden(?=[\s=>])|aria-hidden=["']true["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_, href, label) =>
            `${textContent(label)} [link: ${href}]`)
        .replace(/<(img|audio|video|source)\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi, (tag, _kind, src) => {
            const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1];
            const reference = src.startsWith("data:") ? embeddedMediaText(src) : src;
            return ` [media: ${reference}${alt ? `, alt: ${alt}` : ""}] `;
        })
        .replace(/<form\b[^>]*>/gi, "\n[form] ")
        .replace(/<\/(?:h[1-6]|p|li|dt|dd|tr|label|button|form|figcaption|pre|nav)\s*>/gi, "\n")
        .replace(/<\/(?:td|th)\s*>/gi, " | ")
        .replace(/<[^>]+>/g, " "));
}

async function readPublicAsset(root: string, entry: PublicBundleManifest["assets"][number], route: boolean) {
    const segments = entry.path.slice(1).split("/");
    if (!entry.path.startsWith("/") || /[\\%?#]/.test(entry.path)
        || (entry.path !== "/" && segments.some((part) => part === "" || part === "." || part === ".."))) {
        throw new Error(`Unsafe public path in bundle manifest: ${entry.path}`);
    }
    const file = path.join(root, ...segments, ...(route ? ["index.html"] : []));
    const actual = await realpath(file);
    if (!actual.startsWith(root + path.sep)) throw new Error(`Public file escapes its bundle: ${entry.path}`);
    const bytes = await readFile(actual);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        throw new Error(`Public file differs from the saved manifest: ${entry.path}`);
    }
    return bytes;
}

export async function loadLevelEvidence(level: { id: string; title: string; publicDirectory: string }, withImages: boolean): Promise<LevelEvidence> {
    const root = await realpath(level.publicDirectory);
    const manifestFile = await realpath(path.join(root, "bundle.manifest.json"));
    if (!manifestFile.startsWith(root + path.sep)) throw new Error(`Public manifest escapes its bundle: ${level.id}`);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as PublicBundleManifest;
    if (manifest.schemaVersion !== "1.0.0" || manifest.levelId !== level.id
        || !Array.isArray(manifest.assets) || !manifest.routes?.some((route) => route.path === "/")) {
        throw new Error(`Invalid public bundle manifest for ${level.id}.`);
    }
    const evidence: LevelEvidence = { title: level.title, paths: new Set(), content: [], images: [], unrendered: [] };
    for (const [entries, route] of [[manifest.routes, true], [manifest.assets, false]] as const) {
        for (const entry of entries) {
            if (entry.mediaType === "text/css") continue;
            const bytes = await readPublicAsset(root, entry, route);
            evidence.paths.add(entry.path);
            if (entry.mediaType === "text/html") {
                const html = bytes.toString("utf8");
                evidence.content.push({ path: entry.path, text: playerPageText(html) });
                if (/\bsrc=["']data:/i.test(html)) evidence.unrendered.push(`${entry.path} (embedded visuals)`);
            } else if (entry.mediaType === "image/svg+xml") {
                const labels = svgText(bytes.toString("utf8"));
                if (labels) evidence.content.push({ path: entry.path, text: `SVG text: ${labels}` });
                evidence.unrendered.push(`${entry.path} (SVG visuals)`);
            } else if (withImages && /^image\/(png|jpeg|webp)$/.test(entry.mediaType)) {
                evidence.images.push({
                    path: entry.path,
                    content: { type: "image", mimeType: entry.mediaType, data: bytes.toString("base64") }
                });
            } else {
                evidence.unrendered.push(`${entry.path} (${entry.mediaType})`);
            }
        }
    }
    return evidence;
}
