import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeSvgImageArtifactPreview } from "../../core/image-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createQrCodePuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([Type.Literal("explicit"), Type.Literal("indirect"), Type.Literal("contextual"), Type.Literal("hidden")]);
const payloadKindSchema = Type.Union([Type.Literal("message"), Type.Literal("identifier"), Type.Literal("url")]);
const acceptedAlternativesSchema = Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 10 });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    payloadKind: payloadKindSchema,
    documentTheme: Type.String({ minLength: 1, maxLength: 160 }),
    recognitionLevel: recognitionLevelSchema,
    scanHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema),
    moduleSize: Type.Optional(Type.Integer({ minimum: 4, maximum: 24 }))
}, { additionalProperties: false });

export async function writeQrCodeArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSvgImageArtifactPreview({ puzzle, artifactDirectoryName: "qr-code", fallbackFileStem: "qr-code-preview" });
}

export const createQrCodePuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_qr_code_puzzle",
    label: "Create a QR-code puzzle",
    description: "Create an SVG QR-code puzzle encoding a short message, identifier, or URL.",
    parameters,
    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) throw new Error("Production QR-code puzzles require an upstream puzzle ID.");
        const puzzle = createQrCodePuzzle({
            id: params.id ?? "demo-qr-code",
            intendedSolution: params.intendedSolution,
            payloadKind: params.payloadKind,
            documentTheme: params.documentTheme,
            recognitionLevel: params.recognitionLevel,
            scanHint: params.scanHint,
            acceptedAlternatives: params.acceptedAlternatives,
            moduleSize: params.moduleSize
        });
        if (params.mode === "demo") {
            const preview = await writeQrCodeArtifactPreview(puzzle);
            return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactPreviewPath: preview.path, artifactPreviewUrl: preview.fileUrl, answer: puzzle.solution.canonical }) }], details: puzzle };
        }
        return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifactMediaType: puzzle.artifact.mediaType, answer: puzzle.solution.canonical }) }], details: puzzle };
    }
};
