import { createHash } from "node:crypto";

export type ContextualImageKind =
    | "document"
    | "photograph"
    | "diagram"
    | "badge"
    | "sign"
    | "facility";

export function contextualImageKind(description: string): ContextualImageKind {
    const text = description.toLowerCase();
    if (/\b(document|memo|notice|report|record|paper|stamp|form|scan|certificate|letter|permit)\b/.test(text)) return "document";
    if (/\b(diagram|map|plan|schematic|chart|network|blueprint)\b/.test(text)) return "diagram";
    if (/\b(badge|identification|identity|credential|pass|profile)\b/.test(text)) return "badge";
    if (/\b(sign|poster|billboard|placard|marker)\b/.test(text)) return "sign";
    if (/\b(photo|photograph|portrait|people|person|staff|volunteer|group)\b/.test(text)) return "photograph";
    return "facility";
}

function hashByte(seed: string, salt: string): number {
    return createHash("sha256").update(seed).update(salt).digest()[0];
}

export function createContextualCoverRgba(width: number, height: number, description: string): Buffer {
    const kind = contextualImageKind(description);
    const rgba = Buffer.alloc(width * height * 4);
    const palettes: Record<ContextualImageKind, [number, number, number]> = {
        document: [224, 216, 192], photograph: [126, 165, 176], diagram: [180, 202, 211],
        badge: [176, 196, 204], sign: [163, 184, 164], facility: [130, 164, 174]
    };
    const set = (x: number, y: number, color: [number, number, number]) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const offset = (y * width + x) * 4;
        rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255;
    };
    const rect = (x: number, y: number, w: number, h: number, color: [number, number, number]) => {
        for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) set(px, py, color);
    };
    rect(0, 0, width, height, palettes[kind]);
    const jitter = hashByte(description, "context") % 12;
    if (kind === "document") {
        rect(Math.floor(width * .18), 3, Math.floor(width * .64), height - 6, [244, 239, 218]);
        for (let y = 12; y < height - 8; y += 8) rect(Math.floor(width * .27), y, Math.floor(width * (.43 + ((y + jitter) % 3) * .05)), 2, [151, 151, 139]);
        rect(Math.floor(width * .63), Math.floor(height * .68), Math.floor(width * .12), 3, [165, 92, 92]);
    } else if (kind === "diagram") {
        rect(4, 4, width - 8, height - 8, [229, 238, 241]);
        for (const [x, y] of [[.2,.5],[.45,.25],[.55,.72],[.78,.42]]) rect(Math.floor(width*x)-3, Math.floor(height*y)-3, 7, 7, [89, 124, 139]);
    } else if (kind === "badge") {
        rect(Math.floor(width*.2), 4, Math.floor(width*.6), height-8, [238, 242, 242]);
        rect(Math.floor(width*.2), 4, Math.floor(width*.6), Math.max(5,Math.floor(height*.17)), [83, 122, 139]);
        rect(Math.floor(width*.28), Math.floor(height*.32), Math.floor(width*.18), Math.floor(height*.38), [148, 174, 183]);
        rect(Math.floor(width*.53), Math.floor(height*.38), Math.floor(width*.2), 3, [105, 126, 134]);
    } else if (kind === "sign") {
        rect(0, Math.floor(height*.65), width, Math.ceil(height*.35), [126, 151, 112]);
        rect(Math.floor(width*.2), Math.floor(height*.15), Math.floor(width*.6), Math.floor(height*.5), [235, 229, 202]);
        rect(Math.floor(width*.28), Math.floor(height*.32), Math.floor(width*.44), 4, [111, 110, 98]);
    } else if (kind === "photograph") {
        rect(0, Math.floor(height*.62), width, Math.ceil(height*.38), [118, 150, 105]);
        for (const x of [.28,.5,.72]) {
            rect(Math.floor(width*x)-4, Math.floor(height*.36), 9, 9, [194, 151, 124]);
            rect(Math.floor(width*x)-7, Math.floor(height*.5), 15, Math.floor(height*.35), [87 + Math.floor(x*40), 116, 130]);
        }
    } else {
        rect(0, Math.floor(height*.68), width, Math.ceil(height*.32), [99, 135, 146]);
        rect(Math.floor(width*.1), Math.floor(height*.3), Math.floor(width*.55), Math.floor(height*.45), [190, 190, 176]);
        rect(Math.floor(width*.72), Math.floor(height*.16), Math.floor(width*.08), Math.floor(height*.59), [127, 127, 116]);
    }
    return rgba;
}
