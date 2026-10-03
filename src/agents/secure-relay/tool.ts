import { generateKeyPairSync } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import {
    buildSecureRelayInstruction,
    createSecureRelayPuzzle
} from "./engine.js";
import { encryptRsaOaep } from "./crypto.js";

const pemSchema = Type.String({ minLength: 100, maxLength: 10000 });
const identifierSchema = Type.String({ minLength: 1, maxLength: 32 });
const referenceSchema = Type.String({ minLength: 1, maxLength: 120 });

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1 }),
        payloadReference: referenceSchema,
        privateKeyReference: referenceSchema,
        impersonatedIdentity: identifierSchema,
        impersonatedPublicKeyPem: pemSchema,
        impersonatedPrivateKeyPem: pemSchema,
        incomingCiphertext: Type.String({ minLength: 1, maxLength: 20000 }),
        nonce: Type.String({ minLength: 4, maxLength: 32 }),
        recipientId: identifierSchema,
        recipientPublicKeyPem: pemSchema,
        recipientPrivateKeyPem: pemSchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1 }),
        payloadReference: referenceSchema,
        privateKeyReference: referenceSchema,
        impersonatedIdentity: identifierSchema,
        nonce: Type.String({ minLength: 4, maxLength: 32 }),
        recipientId: identifierSchema
    }, { additionalProperties: false })
]);

function generateRsaKeyPair(): { publicKey: string; privateKey: string } {
    return generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
}

export const createSecureRelayPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_secure_relay_puzzle",
    label: "Create a secure relay puzzle",
    description: [
        "Validate an upstream secure-relay specification, RSA key pairs, and fixed incoming order;",
        "construct a static private-key-decryption and public-key-encryption puzzle;",
        "and return the validated private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        let puzzle: PrivatePuzzleInstance;
        if (params.mode === "production") {
            puzzle = createSecureRelayPuzzle(params);
        } else {
            const impersonatedKeys = generateRsaKeyPair();
            const recipientKeys = generateRsaKeyPair();
            const draft = {
                id: params.id ?? "demo-secure-relay",
                intendedSolution: params.intendedSolution,
                payloadReference: params.payloadReference,
                privateKeyReference: params.privateKeyReference,
                impersonatedIdentity: params.impersonatedIdentity,
                impersonatedPublicKeyPem: impersonatedKeys.publicKey,
                impersonatedPrivateKeyPem: impersonatedKeys.privateKey,
                incomingCiphertext: "pending",
                nonce: params.nonce,
                recipientId: params.recipientId,
                recipientPublicKeyPem: recipientKeys.publicKey,
                recipientPrivateKeyPem: recipientKeys.privateKey,
                revealDemoPrerequisites: true
            };
            puzzle = createSecureRelayPuzzle({
                ...draft,
                incomingCiphertext: encryptRsaOaep(
                    impersonatedKeys.publicKey,
                    buildSecureRelayInstruction(draft)
                )
            });
        }

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    id: puzzle.id,
                    prompt: puzzle.prompt,
                    expectedDecryptedReply: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
