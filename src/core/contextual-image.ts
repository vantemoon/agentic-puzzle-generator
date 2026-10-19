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

function xml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function buildContextualSvg(description: string, width = 420, height = 180): string {
    const kind = contextualImageKind(description);
    const label = xml(description);
    const common = `<rect width="${width}" height="${height}" fill="#dce4e8"/>`;
    let scene: string[];
    if (kind === "document") {
        scene = [
            `<rect x="70" y="12" width="280" height="156" rx="3" fill="#f7f1df" stroke="#9d9279"/>`,
            `<rect x="94" y="30" width="150" height="9" fill="#6f7778" opacity=".65"/>`,
            ...[52, 67, 82, 97, 112, 127].map((y, index) => `<rect x="94" y="${y}" width="${index % 2 === 0 ? 218 : 184}" height="4" fill="#9b9b91" opacity=".55"/>`),
            `<circle cx="294" cy="128" r="24" fill="none" stroke="#a65f5f" stroke-width="5" opacity=".55"/>`,
            `<path d="M276 128h36M294 110v36" stroke="#a65f5f" stroke-width="3" opacity=".4"/>`
        ];
    } else if (kind === "diagram") {
        scene = [
            `<rect x="28" y="20" width="364" height="140" rx="8" fill="#edf3f5" stroke="#8197a3"/>`,
            `<path d="M86 92L174 50L258 104L334 58M174 50L188 132L258 104" fill="none" stroke="#718c9b" stroke-width="4"/>`,
            ...[[86,92],[174,50],[188,132],[258,104],[334,58]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#9bb9c6" stroke="#536d79"/>`)
        ];
    } else if (kind === "badge") {
        scene = [
            `<rect x="104" y="12" width="212" height="156" rx="12" fill="#f4f7f8" stroke="#718895" stroke-width="3"/>`,
            `<rect x="104" y="12" width="212" height="30" rx="10" fill="#668493"/>`,
            `<circle cx="161" cy="91" r="27" fill="#a8bbc4"/>`,
            `<path d="M122 143c7-29 70-29 78 0" fill="#8da5b1"/>`,
            `<rect x="218" y="69" width="70" height="7" fill="#6f8189"/>`,
            `<rect x="218" y="88" width="58" height="5" fill="#9ca9ae"/>`,
            `<rect x="218" y="104" width="76" height="5" fill="#9ca9ae"/>`
        ];
    } else if (kind === "sign") {
        scene = [
            `<rect y="112" width="420" height="68" fill="#9dac8d"/>`,
            `<rect y="0" width="420" height="112" fill="#b9d0dc"/>`,
            `<rect x="196" y="88" width="12" height="82" fill="#67645c"/>`,
            `<rect x="86" y="28" width="232" height="86" rx="5" fill="#efe8ce" stroke="#716e61" stroke-width="4"/>`,
            `<rect x="112" y="51" width="180" height="10" fill="#77766e"/>`,
            `<rect x="128" y="75" width="148" height="6" fill="#99978b"/>`
        ];
    } else if (kind === "photograph") {
        scene = [
            `<rect width="420" height="108" fill="#bdd5df"/>`,
            `<rect y="108" width="420" height="72" fill="#8fab83"/>`,
            ...[130,210,290].flatMap((x, index) => [
                `<circle cx="${x}" cy="${66 + index * 4}" r="18" fill="#c89f82"/>`,
                `<path d="M${x - 30} 142c4-55 56-55 60 0" fill="${["#66869a","#8c7568","#718a70"][index]}"/>`
            ])
        ];
    } else {
        scene = [
            `<rect width="420" height="102" fill="#bcd3dc"/>`,
            `<rect y="102" width="420" height="78" fill="#7796a0"/>`,
            `<rect x="54" y="50" width="218" height="82" fill="#c7c5b7" stroke="#74766f"/>`,
            `<rect x="86" y="76" width="42" height="56" fill="#738690"/>`,
            `<rect x="154" y="68" width="74" height="28" fill="#91a9b3"/>`,
            `<rect x="304" y="30" width="22" height="102" fill="#8f8d80"/>`,
            `<path d="M326 50c36 8 48 24 58 44" fill="none" stroke="#d8dde0" stroke-width="12" opacity=".75"/>`
        ];
    }
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
        `<title>${label}</title>`,
        common,
        ...scene,
        "</svg>"
    ].join("");
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
