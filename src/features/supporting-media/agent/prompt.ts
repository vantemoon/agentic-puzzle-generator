import type { SupportingMediaRequest } from "../../level-bundle/types.js";
import { PLAIN_LANGUAGE_HOUSE_STYLE } from "../../../shared/policies/house-style.js";

const RASTER_RULES = `
Create a layered 640 by 360 raster composition. Submit backgroundColor and drawing elements in back-to-front order. Use only:
rect|x|y|width|height|fill|opacity|cornerRadius
circle|cx|cy|radius|fill|opacity
line|x1|y1|x2|y2|stroke|strokeWidth|opacity
Use x coordinates from 0 to 640, y coordinates from 0 to 360, positive sizes, opacity from 0 to 1, rectangle radius from 0 to 100, and line width from 1 to 40.
Colors are six-digit hexadecimal values. Use many context-specific layers, depth, lighting, shadows, and secondary details. Do not render text.`;

const SVG_RULES = `
Create safe static 960 by 540 SVG artwork using the JSON drawing objects defined in the tool schema. For example:
{"kind":"rect","x":40,"y":60,"width":160,"height":80,"fill":"#E9DCC8"}
{"kind":"line","x1":40,"y1":160,"x2":200,"y2":160,"stroke":"#544638","strokeWidth":2}
Use a visible fill or stroke as appropriate. Omitted fill and stroke default to "none", stroke width and corner radii to 0, and opacity to 1. Submit the objects in back-to-front order.`;

const DOCUMENT_RULES = `
Create a realistic self-contained public document with a title, optional subtitle, and substantive sections. Use paragraphs for editorial copy, items for menus or lists, and records for labeled facts. Do not include HTML; the tool renders and escapes the document.`;

export function supportingMediaSystemPrompt(request: SupportingMediaRequest): string {
    const modeRules = request.kind === "raster-image"
        ? RASTER_RULES
        : request.kind === "svg" ? SVG_RULES : DOCUMENT_RULES;
    return `
You are the ${request.kind} mode of the Supporting Media Agent for a fictional alternate-reality game world.

${PLAIN_LANGUAGE_HOUSE_STYLE}

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
