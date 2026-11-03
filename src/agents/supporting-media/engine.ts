import { Buffer } from "node:buffer";

import { encodeRgbaPng } from "../channel-clue/png.js";
import { assertSafeStaticSvg, compileDrawingInstructions } from "../visual-clue/engine.js";
import type { GeneratedSupportingMedia } from "./library.js";

const RASTER_WIDTH = 640;
const RASTER_HEIGHT = 360;
const SVG_WIDTH = 960;
const SVG_HEIGHT = 540;

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function color(value: string): [number, number, number] {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Raster color ${value} must use six-digit hexadecimal notation.`);
    return [
        Number.parseInt(value.slice(1, 3), 16),
        Number.parseInt(value.slice(3, 5), 16),
        Number.parseInt(value.slice(5, 7), 16)
    ];
}

function number(value: string, name: string, minimum: number, maximum: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`Raster ${name} must be from ${minimum} to ${maximum}.`);
    }
    return parsed;
}

function opacity(value: string): number {
    return number(value, "opacity", 0, 1);
}

function rasterize(backgroundColor: string, elements: string[]): Buffer {
    if (elements.length < 1 || elements.length > 160) {
        throw new Error("Raster artwork must contain 1 to 160 drawing elements.");
    }
    const rgba = Buffer.alloc(RASTER_WIDTH * RASTER_HEIGHT * 4);
    const background = color(backgroundColor);
    for (let pixel = 0; pixel < RASTER_WIDTH * RASTER_HEIGHT; pixel += 1) {
        rgba[pixel * 4] = background[0];
        rgba[pixel * 4 + 1] = background[1];
        rgba[pixel * 4 + 2] = background[2];
        rgba[pixel * 4 + 3] = 255;
    }
    const paint = (x: number, y: number, fill: [number, number, number], alpha: number): void => {
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= RASTER_WIDTH || py >= RASTER_HEIGHT) return;
        const offset = (py * RASTER_WIDTH + px) * 4;
        rgba[offset] = Math.round(rgba[offset] * (1 - alpha) + fill[0] * alpha);
        rgba[offset + 1] = Math.round(rgba[offset + 1] * (1 - alpha) + fill[1] * alpha);
        rgba[offset + 2] = Math.round(rgba[offset + 2] * (1 - alpha) + fill[2] * alpha);
    };
    for (const instruction of elements) {
        const parts = instruction.split("|");
        if (parts[0] === "rect" && parts.length === 8) {
            const [, xValue, yValue, widthValue, heightValue, fillValue, opacityValue, radiusValue] = parts;
            const x = number(xValue, "rectangle x", 0, RASTER_WIDTH);
            const y = number(yValue, "rectangle y", 0, RASTER_HEIGHT);
            const width = number(widthValue, "rectangle width", 1, RASTER_WIDTH);
            const height = number(heightValue, "rectangle height", 1, RASTER_HEIGHT);
            const fill = color(fillValue);
            const alpha = opacity(opacityValue);
            const radius = number(radiusValue, "rectangle radius", 0, 100);
            for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
                for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
                    const dx = Math.max(x + radius - px, 0, px - (x + width - radius));
                    const dy = Math.max(y + radius - py, 0, py - (y + height - radius));
                    if (radius === 0 || dx * dx + dy * dy <= radius * radius) paint(px, py, fill, alpha);
                }
            }
            continue;
        }
        if (parts[0] === "circle" && parts.length === 6) {
            const [, cxValue, cyValue, radiusValue, fillValue, opacityValue] = parts;
            const cx = number(cxValue, "circle cx", 0, RASTER_WIDTH);
            const cy = number(cyValue, "circle cy", 0, RASTER_HEIGHT);
            const radius = number(radiusValue, "circle radius", 1, Math.max(RASTER_WIDTH, RASTER_HEIGHT));
            const fill = color(fillValue);
            const alpha = opacity(opacityValue);
            for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
                for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
                    if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) paint(px, py, fill, alpha);
                }
            }
            continue;
        }
        if (parts[0] === "line" && parts.length === 8) {
            const [, x1Value, y1Value, x2Value, y2Value, fillValue, widthValue, opacityValue] = parts;
            const x1 = number(x1Value, "line x1", 0, RASTER_WIDTH);
            const y1 = number(y1Value, "line y1", 0, RASTER_HEIGHT);
            const x2 = number(x2Value, "line x2", 0, RASTER_WIDTH);
            const y2 = number(y2Value, "line y2", 0, RASTER_HEIGHT);
            const fill = color(fillValue);
            const lineWidth = number(widthValue, "line width", 1, 40);
            const alpha = opacity(opacityValue);
            const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
            for (let step = 0; step <= steps; step += 1) {
                const x = x1 + (x2 - x1) * step / steps;
                const y = y1 + (y2 - y1) * step / steps;
                for (let py = -lineWidth / 2; py <= lineWidth / 2; py += 1) {
                    for (let px = -lineWidth / 2; px <= lineWidth / 2; px += 1) paint(x + px, y + py, fill, alpha);
                }
            }
            continue;
        }
        throw new Error("Raster elements must use rect, circle, or line instructions with the documented fields.");
    }
    return rgba;
}

export function generateRasterMedia(options: {
    backgroundColor: string;
    elements: string[];
}): GeneratedSupportingMedia {
    const rgba = rasterize(options.backgroundColor, options.elements);
    return {
        mediaType: "image/png",
        encoding: "base64",
        data: encodeRgbaPng(RASTER_WIDTH, RASTER_HEIGHT, rgba)
    };
}

export function generateSvgMedia(options: {
    title: string;
    description: string;
    elements: string[];
}): GeneratedSupportingMedia {
    const drawing = compileDrawingInstructions(options.elements, "supporting artwork", 200);
    const source = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img">`,
        `<title>${escapeHtml(options.title)}</title>`,
        `<desc>${escapeHtml(options.description)}</desc>`,
        drawing,
        "</svg>"
    ].join("\n");
    assertSafeStaticSvg(source);
    return { mediaType: "image/svg+xml", encoding: "utf8", data: source };
}

export interface SupportingDocumentSection {
    heading: string;
    paragraphs?: string[];
    items?: string[];
    records?: Array<{ label: string; value: string }>;
}

export function generateDocumentMedia(options: {
    title: string;
    subtitle?: string;
    sections: SupportingDocumentSection[];
    footer?: string;
    accentColor: string;
}): GeneratedSupportingMedia {
    color(options.accentColor);
    if (options.sections.length < 1 || options.sections.length > 12) {
        throw new Error("Supporting documents must contain 1 to 12 sections.");
    }
    const sections = options.sections.map((section) => {
        if ((section.paragraphs?.length ?? 0) + (section.items?.length ?? 0) + (section.records?.length ?? 0) === 0) {
            throw new Error(`Supporting document section ${section.heading} has no content.`);
        }
        const paragraphs = (section.paragraphs ?? []).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
        const items = section.items === undefined
            ? ""
            : `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
        const records = section.records === undefined
            ? ""
            : `<dl>${section.records.map((item) =>
                `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`
            ).join("")}</dl>`;
        return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${items}${records}</section>`;
    }).join("\n");
    const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(options.title)}</title><link rel="stylesheet" href="/assets/site.css"></head><body class="standalone-document" data-accent="${escapeHtml(options.accentColor)}"><main><header><h1>${escapeHtml(options.title)}</h1>${options.subtitle === undefined ? "" : `<p class="subtitle">${escapeHtml(options.subtitle)}</p>`}</header>${sections}${options.footer === undefined ? "" : `<footer>${escapeHtml(options.footer)}</footer>`}</main></body></html>`;
    return { mediaType: "text/html", encoding: "utf8", data: source };
}
