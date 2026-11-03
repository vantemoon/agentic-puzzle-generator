import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { SupportingMediaRequest } from "../../levels/bundle.js";
import {
    generateDocumentMedia,
    generateRasterMedia,
    generateSvgMedia
} from "./engine.js";
import type { GeneratedSupportingMedia } from "./library.js";

const closed = { additionalProperties: false } as const;

const rasterParameters = Type.Object({
    kind: Type.Literal("raster-image"),
    backgroundColor: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
    elements: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), {
        minItems: 1,
        maxItems: 160
    })
}, closed);

const svgParameters = Type.Object({
    kind: Type.Literal("svg"),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.String({ minLength: 1, maxLength: 600 }),
    elements: Type.Array(Type.String({ minLength: 1, maxLength: 700 }), {
        minItems: 1,
        maxItems: 200
    })
}, closed);

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
                    ? generateSvgMedia(params)
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
