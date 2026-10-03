import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createAnomalousPhrasePuzzle } from "./engine.js";

const anomalyKind = Type.Union([
    Type.Literal("unusual-phrase"),
    Type.Literal("factual-inconsistency"),
    Type.Literal("out-of-context-entity"),
    Type.Literal("timeline-inconsistency"),
    Type.Literal("location-inconsistency")
]);

const provenance = Type.Object({
    sourceId: Type.String({ minLength: 1 }),
    retrievedValue: Type.Unknown(),
    retrievedAt: Type.Optional(Type.String({ minLength: 1 }))
}, { additionalProperties: false });

const shared = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 160 }),
    documentTemplate: Type.String({ minLength: 1, maxLength: 12_000 }),
    anomalousPhrase: Type.String({ minLength: 1, maxLength: 240 }),
    normalityContext: Type.String({ minLength: 1, maxLength: 2_000 }),
    genre: Type.String({ minLength: 1, maxLength: 80 }),
    anomalyKind,
    solverInstruction: Type.Optional(Type.String({ minLength: 1, maxLength: 400 })),
    placeholder: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    acceptedAlternatives: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 160 }))),
    externalKnowledgeRequired: Type.Optional(Type.Boolean()),
    externalKnowledgeProvenance: Type.Optional(Type.Array(provenance, { minItems: 1 }))
};

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        ...shared
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        ...shared
    }, { additionalProperties: false })
]);

export const createAnomalousPhrasePuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_anomalous_phrase_puzzle",
    label: "Create an anomalous phrase puzzle",
    description: [
        "Validate a document template, anomaly, context, intended solution, and provenance;",
        "insert the semantic anomaly and return the verified puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createAnomalousPhrasePuzzle({
            id: params.id ?? "demo-anomalous-phrase",
            intendedSolution: params.intendedSolution,
            documentTemplate: params.documentTemplate,
            anomalousPhrase: params.anomalousPhrase,
            normalityContext: params.normalityContext,
            genre: params.genre,
            anomalyKind: params.anomalyKind,
            solverInstruction: params.solverInstruction,
            placeholder: params.placeholder,
            acceptedAlternatives: params.acceptedAlternatives,
            externalKnowledgeRequired: params.externalKnowledgeRequired,
            externalKnowledgeProvenance: params.externalKnowledgeProvenance
        });

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    id: puzzle.id,
                    prompt: puzzle.prompt,
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
