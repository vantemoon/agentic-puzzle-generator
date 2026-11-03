import type { SupportingMediaRequest } from "../../levels/bundle.js";

const RASTER_RULES = `
Create a layered 640 by 360 raster composition. Submit backgroundColor and drawing elements in back-to-front order. Use only:
rect|x|y|width|height|fill|opacity|cornerRadius
circle|cx|cy|radius|fill|opacity
line|x1|y1|x2|y2|stroke|strokeWidth|opacity
Colors are six-digit hexadecimal values. Use many context-specific layers, depth, lighting, shadows, and secondary details. Do not render text.`;

const SVG_RULES = `
Create safe static 960 by 540 SVG artwork through drawing instructions; never submit XML or SVG markup. Use only:
rect|x|y|width|height|fill|stroke|strokeWidth|opacity|rx|ry
circle|cx|cy|radius|fill|stroke|strokeWidth|opacity
ellipse|cx|cy|rx|ry|fill|stroke|strokeWidth|opacity
line|x1|y1|x2|y2|stroke|strokeWidth|opacity
polygon|points|fill|stroke|strokeWidth|opacity
polyline|points|fill|stroke|strokeWidth|opacity
path|pathData|fill|stroke|strokeWidth|opacity
text|x|y|fontSize|fill|anchor|family|content
Colors are hexadecimal or none. Text anchors are start, middle, or end. Font families are sans-serif, serif, or monospace.`;

const DOCUMENT_RULES = `
Create a realistic self-contained public document with a title, optional subtitle, and substantive sections. Use paragraphs for editorial copy, items for menus or lists, and records for labeled facts. Do not include HTML; the tool renders and escapes the document.`;

export function supportingMediaSystemPrompt(request: SupportingMediaRequest): string {
    const modeRules = request.kind === "raster-image"
        ? RASTER_RULES
        : request.kind === "svg" ? SVG_RULES : DOCUMENT_RULES;
    return `
You are the ${request.kind} mode of the Supporting Media Agent for a fictional alternate-reality game world.

Create exactly one non-puzzle asset for the supplied request and call submit_supporting_media once. The asset must look like an ordinary part of the fictional website, reflect the supplied world entities and site visual profile, and remain consistent with established canon.

Rules:
1. Preserve the request's purpose, brief, accessibility meaning, world entities, and site style.
2. Do not create clues, answers, hidden messages, codes, ciphers, acrostics, steganography, suspicious emphasized text, or puzzle instructions.
3. Do not invent named people, organizations, places, events, relationships, dates, addresses, or contact details that are absent from the supplied context.
4. Incidental visual details may be invented when they do not establish canon.
5. Do not imitate a real organization, publication, logo, or commercial service.
6. Do not use remote assets, scripts, external URLs, or copyrighted characters and brands.
7. Do not return prose instead of calling the tool. If validation fails, correct only the reported problem and retry.
${modeRules}
`.trim();
}
