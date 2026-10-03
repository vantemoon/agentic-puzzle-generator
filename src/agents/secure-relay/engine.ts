import { timingSafeEqual } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import {
    assertMatchingRsaKeyPair,
    decryptRsaOaep,
    getRsaOaepMaxPlaintextBytes
} from "./crypto.js";

export interface SecureRelayPuzzleSpec extends PuzzleGenerationSpec {
    payloadReference: string;
    privateKeyReference: string;
    impersonatedIdentity: string;
    impersonatedPublicKeyPem: string;
    impersonatedPrivateKeyPem: string;
    incomingCiphertext: string;
    nonce: string;
    recipientId: string;
    recipientPublicKeyPem: string;
    recipientPrivateKeyPem: string;
    revealDemoPrerequisites?: boolean;
}

export type SecureRelaySubmissionFailure =
    | "wrong-validator"
    | "invalid-json"
    | "invalid-shape"
    | "wrong-recipient"
    | "decryption-failed"
    | "wrong-plaintext";

export type SecureRelaySubmissionResult =
    | { accepted: true }
    | { accepted: false; reason: SecureRelaySubmissionFailure };

const PROTOCOL_VERSION = "SECURE-RELAY/1";
const MAX_REFERENCE_LENGTH = 120;
const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9-]{0,31}$/;
const NONCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,31}$/;

function validateIdentifier(value: string, label: string): void {
    if (!IDENTIFIER_PATTERN.test(value)) {
        throw new Error(
            `${label} must contain 1 to 32 uppercase letters, digits, or hyphens and start with a letter.`
        );
    }
}

function validateReference(value: string, label: string): void {
    if (value.length === 0 || value.length > MAX_REFERENCE_LENGTH) {
        throw new Error(`${label} must contain 1 to ${MAX_REFERENCE_LENGTH} characters.`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(value)) {
        throw new Error(`${label} contains unsupported characters.`);
    }
}

export function buildSecureRelayInstruction(spec: Pick<
    SecureRelayPuzzleSpec,
    "nonce" | "recipientId" | "payloadReference"
>): string {
    return [
        PROTOCOL_VERSION,
        `NONCE=${spec.nonce}`,
        `RECIPIENT=${spec.recipientId}`,
        `SOURCE=${spec.payloadReference}`,
        "FORMAT=<NONCE>:<SOURCE-VALUE>"
    ].join("\n");
}

export function buildSecureRelayReply(nonce: string, sourceValue: string): string {
    return `${nonce}:${sourceValue}`;
}

export function validateSecureRelaySpec(spec: SecureRelayPuzzleSpec): void {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }
    if (spec.intendedSolution.length === 0) {
        throw new Error("The intended solution must not be empty.");
    }

    validateIdentifier(spec.impersonatedIdentity, "The impersonated identity");
    validateIdentifier(spec.recipientId, "The recipient ID");
    if (!NONCE_PATTERN.test(spec.nonce)) {
        throw new Error(
            "The nonce must contain 4 to 32 uppercase letters, digits, or hyphens."
        );
    }
    validateReference(spec.payloadReference, "The payload reference");
    validateReference(spec.privateKeyReference, "The private-key reference");

    assertMatchingRsaKeyPair(
        spec.impersonatedPublicKeyPem,
        spec.impersonatedPrivateKeyPem,
        "Impersonated identity"
    );
    assertMatchingRsaKeyPair(
        spec.recipientPublicKeyPem,
        spec.recipientPrivateKeyPem,
        "Recipient"
    );

    let incomingPlaintext: string;
    try {
        incomingPlaintext = decryptRsaOaep(
            spec.impersonatedPrivateKeyPem,
            spec.incomingCiphertext
        ).toString("utf8");
    } catch {
        throw new Error(
            "The incoming ciphertext cannot be decrypted with the impersonated identity private key."
        );
    }

    const expectedInstruction = buildSecureRelayInstruction(spec);
    if (incomingPlaintext !== expectedInstruction) {
        throw new Error(
            "The incoming ciphertext does not contain the declared secure-relay instruction."
        );
    }

    const expectedReply = buildSecureRelayReply(spec.nonce, spec.intendedSolution);
    const maximumReplyBytes = getRsaOaepMaxPlaintextBytes(spec.recipientPublicKeyPem);
    const replyBytes = Buffer.byteLength(expectedReply, "utf8");
    if (replyBytes > maximumReplyBytes) {
        throw new Error(
            `The constructed reply is ${replyBytes} UTF-8 bytes but the recipient key allows at most ${maximumReplyBytes}.`
        );
    }
}

function buildArtifact(spec: SecureRelayPuzzleSpec): string {
    const sections = [
        "SECURE RELAY — QUEUED ORDER",
        [
            `Assumed identity: ${spec.impersonatedIdentity}`,
            `Private-key source: ${spec.privateKeyReference}`
        ].join("\n"),
        [
            "Decrypt the queued order with the assumed identity's private key.",
            "The recovered order identifies which earlier puzzle output must be retrieved.",
            "Follow the recovered routing and formatting instructions exactly.",
            "Encrypt the resulting UTF-8 reply for the named recipient using RSA-OAEP with SHA-256.",
            "Submit a JSON object containing only recipient and ciphertext; encode the ciphertext as Base64."
        ].join("\n"),
        `QUEUED ENCRYPTED ORDER\n${spec.incomingCiphertext}`,
        `RECIPIENT DIRECTORY\n${spec.recipientId}\n${spec.recipientPublicKeyPem}`,
        [
            "SUBMISSION FORMAT",
            "{",
            `  \"recipient\": \"${spec.recipientId}\",`,
            "  \"ciphertext\": \"<Base64 RSA-OAEP ciphertext>\"",
            "}"
        ].join("\n")
    ];

    if (spec.revealDemoPrerequisites) {
        sections.push([
            "DEMO PREREQUISITES",
            `Simulated result from ${spec.payloadReference}: ${spec.intendedSolution}`,
            `Simulated private key recovered from ${spec.privateKeyReference}:`,
            spec.impersonatedPrivateKeyPem
        ].join("\n"));
    }

    return sections.join("\n\n");
}

export function createSecureRelayPuzzle(
    spec: SecureRelayPuzzleSpec
): PrivatePuzzleInstance {
    validateSecureRelaySpec(spec);

    const incomingInstruction = buildSecureRelayInstruction(spec);
    const expectedReply = buildSecureRelayReply(spec.nonce, spec.intendedSolution);
    const artifactSource = buildArtifact(spec);
    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "secure-communication",
        subtype: "asymmetric-sealed-relay",
        inputs: [
            {
                key: "identity_private_key",
                valueType: "rsa-private-decryption-key",
                description: "The private key recovered for the identity being impersonated.",
                required: true,
                constraints: { algorithm: "RSA", minimumModulusBits: 2048 },
                value: spec.impersonatedPrivateKeyPem
            },
            {
                key: "incoming_instruction",
                valueType: "rsa-oaep-ciphertext",
                description: "The queued encrypted instruction addressed to the impersonated identity.",
                required: true,
                constraints: { oaepHash: "sha256", encoding: "base64" },
                value: spec.incomingCiphertext
            },
            {
                key: "transferred_payload",
                valueType: "plain-text",
                description: "The exact value transferred from the referenced earlier puzzle.",
                required: true,
                constraints: { encoding: "utf8", normalization: "none" },
                value: spec.intendedSolution
            },
            {
                key: "recipient_public_key",
                valueType: "rsa-public-encryption-key",
                description: "The public key used to seal the reply for the recipient.",
                required: true,
                constraints: { algorithm: "RSA-OAEP", oaepHash: "sha256" },
                value: spec.recipientPublicKeyPem
            }
        ],
        outputs: [{
            key: "sealed_reply",
            valueType: "rsa-oaep-ciphertext",
            description: "A randomized Base64 ciphertext containing the nonce and transferred value.",
            constraints: {
                recipient: spec.recipientId,
                oaepHash: "sha256",
                encoding: "base64",
                canonicalValue: false
            }
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: artifactSource },
        prompt: artifactSource,
        solution: {
            valueType: "text",
            canonical: expectedReply,
            normalization: []
        },
        validator: {
            kind: "secure-relay",
            mode: "deterministic",
            options: {
                expectedRecipient: spec.recipientId,
                expectedNonce: spec.nonce,
                expectedPlaintext: expectedReply,
                recipientPrivateKeyPem: spec.recipientPrivateKeyPem,
                encryption: "rsa-oaep",
                oaepHash: "sha256",
                plaintextEncoding: "utf8",
                ciphertextEncoding: "base64"
            }
        },
        externalKnowledge: { required: false },
        extensions: {
            secureRelay: {
                protocolVersion: PROTOCOL_VERSION,
                impersonatedIdentity: spec.impersonatedIdentity,
                privateKeyReference: spec.privateKeyReference,
                payloadReference: spec.payloadReference,
                incomingInstruction,
                revealDemoPrerequisites: spec.revealDemoPrerequisites === true
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}

function parseSubmission(submission: string): { recipient: string; ciphertext: string } | null {
    let value: unknown;
    try {
        value = JSON.parse(submission);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== "ciphertext" || keys[1] !== "recipient") return null;
    if (typeof record.recipient !== "string" || typeof record.ciphertext !== "string") return null;
    return { recipient: record.recipient, ciphertext: record.ciphertext };
}

export function evaluateSecureRelaySubmission(
    puzzle: PrivatePuzzleInstance,
    submission: string
): SecureRelaySubmissionResult {
    if (puzzle.validator.kind !== "secure-relay") {
        return { accepted: false, reason: "wrong-validator" };
    }

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(submission);
    } catch {
        return { accepted: false, reason: "invalid-json" };
    }
    const parsed = parseSubmission(JSON.stringify(parsedJson));
    if (parsed === null) return { accepted: false, reason: "invalid-shape" };
    if (parsed.recipient !== puzzle.validator.options.expectedRecipient) {
        return { accepted: false, reason: "wrong-recipient" };
    }

    let recovered: Buffer;
    try {
        recovered = decryptRsaOaep(
            puzzle.validator.options.recipientPrivateKeyPem,
            parsed.ciphertext
        );
    } catch {
        return { accepted: false, reason: "decryption-failed" };
    }

    const expected = Buffer.from(puzzle.validator.options.expectedPlaintext, "utf8");
    if (recovered.length !== expected.length || !timingSafeEqual(recovered, expected)) {
        return { accepted: false, reason: "wrong-plaintext" };
    }
    return { accepted: true };
}

export function validateSecureRelaySubmission(
    puzzle: PrivatePuzzleInstance,
    submission: string
): boolean {
    return evaluateSecureRelaySubmission(puzzle, submission).accepted;
}
