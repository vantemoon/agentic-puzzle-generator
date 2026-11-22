import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type, { type Static, type TProperties } from "typebox";
import Value from "typebox/value";

import type { SupportingMediaRequest } from "../../level-bundle/types.js";
import {
    generateDocumentMedia,
    generateRasterMedia,
    generateSvgMedia
} from "../engine.js";
import type { GeneratedSupportingMedia } from "../library.js";

const closed = { additionalProperties: false } as const;

const rasterParameters = Type.Object({
    kind: Type.Literal("raster-image"),
    backgroundColor: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
    elements: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), {
        minItems: 1,
        maxItems: 160
    })
}, closed);

const coordinate = Type.Number({ minimum: -1000, maximum: 1000 });
const size = Type.Number({ minimum: 0, maximum: 1000 });
const paintColor = Type.String({ pattern: "^(?:none|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?)$" });
const strokeStyle = {
    stroke: Type.Optional({ ...paintColor, default: "none" }),
    strokeWidth: Type.Optional(Type.Number({ minimum: 0, maximum: 50, default: 0 })),
    opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 1 }))
};
const fillStyle = { fill: Type.Optional({ ...paintColor, default: "none" }), ...strokeStyle };
const radius = Type.Optional({ ...size, default: 0 });
const element = <K extends string, P extends TProperties>(kind: K, properties: P) =>
    Type.Object({ kind: Type.Literal(kind), ...properties }, closed);
const svgElement = Type.Union([
    element("rect", { x: coordinate, y: coordinate, width: size, height: size, ...fillStyle, rx: radius, ry: radius }),
    element("circle", { cx: coordinate, cy: coordinate, radius: size, ...fillStyle }),
    element("ellipse", { cx: coordinate, cy: coordinate, rx: size, ry: size, ...fillStyle }),
    element("line", { x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, ...strokeStyle }),
    element("polygon", { points: Type.String({ pattern: "^[0-9., -]+$" }), ...fillStyle }),
    element("polyline", { points: Type.String({ pattern: "^[0-9., -]+$" }), ...fillStyle }),
    element("path", { pathData: Type.String({ pattern: "^[MmZzLlHhVvCcSsQqTtAa0-9eE+., -]+$" }), ...fillStyle }),
    element("text", {
        x: coordinate, y: coordinate,
        fontSize: Type.Number({ minimum: 1, maximum: 100 }),
        fill: paintColor,
        anchor: Type.Union([Type.Literal("start"), Type.Literal("middle"), Type.Literal("end")]),
        family: Type.Union([Type.Literal("sans-serif"), Type.Literal("serif"), Type.Literal("monospace")]),
        content: Type.String({ minLength: 1, maxLength: 500, pattern: "^[^|\\r\\n]+$" })
    })
]);

const svgParameters = Type.Object({
    kind: Type.Literal("svg"),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.String({ minLength: 1, maxLength: 600 }),
    elements: Type.Array(svgElement, {
        minItems: 1,
        maxItems: 200
    })
}, closed);

function svgInstructions(elements: Static<typeof svgElement>[]): string[] {
    return elements.map((drawing, index) => {
        const schema = svgElement.anyOf.find((variant) => variant.properties.kind.const === drawing.kind);
        if (schema === undefined || !Value.Check(schema, drawing)) {
            throw new Error(`SVG element ${index + 1} must supply the named fields for its drawing kind.`);
        }
        const values = drawing as Record<string, unknown>;
        // Schema property order matches the existing SVG compiler's positional format.
        return Object.entries(schema.properties)
            .map(([key, field]) => values[key] ?? field.default)
            .join("|");
    });
}

const documentSectionSchema = Type.Object({
    heading: Type.String({ minLength: 1, maxLength: 160 }),
    paragraphs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 1200 }), { minItems: 1 })),
    items: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 })),
    records: Type.Optional(Type.Array(Type.Object({
        label: Type.String({ minLength: 1, maxLength: 120 }),
        value: Type.String({ minLength: 1, maxLength: 500 })
    }, closed), { minItems: 1 }))
}, closed);

const documentParameters = Type.Object({
    kind: Type.Literal("document"),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    subtitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    sections: Type.Array(documentSectionSchema, { minItems: 1, maxItems: 12 }),
    footer: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    accentColor: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" })
}, closed);

const parameters = Type.Union([rasterParameters, svgParameters, documentParameters]);

function publicStrings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(publicStrings);
    if (typeof value === "object" && value !== null) {
        return Object.values(value).flatMap(publicStrings);
    }
    return [];
}

function assertNoPuzzleAnswers(value: unknown, forbiddenAnswers: string[]): void {
    const publicText = publicStrings(value).join(" ").replace(/\s+/g, " ").toLocaleLowerCase();
    const leaked = forbiddenAnswers.find((answer) =>
        answer.trim().length > 0 && publicText.includes(answer.trim().replace(/\s+/g, " ").toLocaleLowerCase())
    );
    if (leaked !== undefined) {
        throw new Error("Supporting media must not contain a puzzle answer or accepted alternative.");
    }
}

export function createSupportingMediaTool(
    request: SupportingMediaRequest,
    forbiddenAnswers: string[]
): AgentTool<typeof parameters, GeneratedSupportingMedia> {
    return {
        name: "submit_supporting_media",
        label: "Submit supporting media",
        description: "Validate and compile one non-puzzle supporting-media asset.",
        parameters,
        async execute(_toolCallId, params) {
            if (params.kind !== request.kind) {
                throw new Error(`Media request ${request.id} requires ${request.kind}, not ${params.kind}.`);
            }
            assertNoPuzzleAnswers(params, forbiddenAnswers);
            const generated = params.kind === "raster-image"
                ? generateRasterMedia(params)
                : params.kind === "svg"
                    ? generateSvgMedia({ ...params, elements: svgInstructions(params.elements) })
                    : generateDocumentMedia(params);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "generated-supporting-media",
                        requestId: request.id,
                        kind: request.kind,
                        mediaType: generated.mediaType
                    })
                }],
                details: generated,
                terminate: true
            };
        }
    };
}
