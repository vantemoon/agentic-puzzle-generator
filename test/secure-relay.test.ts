import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
    decryptRsaOaep,
    encryptRsaOaep,
    getRsaOaepMaxPlaintextBytes
} from "../src/agents/secure-relay/crypto.js";
import {
    buildSecureRelayInstruction,
    createSecureRelayPuzzle,
    evaluateSecureRelaySubmission,
    validateSecureRelaySubmission,
    type SecureRelayPuzzleSpec
} from "../src/agents/secure-relay/engine.js";
import { createSecureRelayPuzzleTool } from "../src/agents/secure-relay/tool.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

function generateTestKeyPair(): { publicKey: string; privateKey: string } {
    return generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
}

const IDENTITY_KEYS = generateTestKeyPair();
const RECIPIENT_KEYS = generateTestKeyPair();

function productionSpec(
    overrides: Partial<SecureRelayPuzzleSpec> = {}
): SecureRelayPuzzleSpec {
    const spec: SecureRelayPuzzleSpec = {
        id: "secure-relay-1",
        intendedSolution: "ORCHID",
        payloadReference: "ARCHIVE-LOCKER",
        privateKeyReference: "IDENTITY-CACHE",
        impersonatedIdentity: "FIELD-AGENT-7",
        impersonatedPublicKeyPem: IDENTITY_KEYS.publicKey,
        impersonatedPrivateKeyPem: IDENTITY_KEYS.privateKey,
        incomingCiphertext: "pending",
        nonce: "R7Q4M2",
        recipientId: "NIGHTINGALE",
        recipientPublicKeyPem: RECIPIENT_KEYS.publicKey,
        recipientPrivateKeyPem: RECIPIENT_KEYS.privateKey,
        ...overrides
    };
    if (overrides.incomingCiphertext === undefined) {
        spec.incomingCiphertext = encryptRsaOaep(
            spec.impersonatedPublicKeyPem,
            buildSecureRelayInstruction(spec)
        );
    }
    return spec;
}

function submission(recipient: string, ciphertext: string): string {
    return JSON.stringify({ recipient, ciphertext });
}

describe("secure relay engine", () => {
    it("constructs a deterministic schema-valid private instance", () => {
        const spec = productionSpec();
        const first = createSecureRelayPuzzle(spec);
        const second = createSecureRelayPuzzle(spec);

        expect(first).toEqual(second);
        expect(first.id).toBe("secure-relay-1");
        expect(first.puzzleType).toBe("secure-communication");
        expect(first.subtype).toBe("asymmetric-sealed-relay");
        expect(first.solution.canonical).toBe("R7Q4M2:ORCHID");
        expect(first.inputs.map((port) => port.key)).toEqual([
            "identity_private_key",
            "incoming_instruction",
            "transferred_payload",
            "recipient_public_key"
        ]);
        expect(first.outputs).toHaveLength(1);
        expect(first.outputs[0].valueType).toBe("rsa-oaep-ciphertext");
        expect(first.outputs[0]).not.toHaveProperty("value");
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("decrypts the fixed incoming order to the declared instruction", () => {
        const spec = productionSpec();
        expect(decryptRsaOaep(spec.impersonatedPrivateKeyPem, spec.incomingCiphertext)
            .toString("utf8"))
            .toBe(buildSecureRelayInstruction(spec));
    });

    it("accepts distinct randomized ciphertexts for the exact transferred value", () => {
        const puzzle = createSecureRelayPuzzle(productionSpec());
        const first = encryptRsaOaep(RECIPIENT_KEYS.publicKey, "R7Q4M2:ORCHID");
        const second = encryptRsaOaep(RECIPIENT_KEYS.publicKey, "R7Q4M2:ORCHID");

        expect(first).not.toBe(second);
        expect(validateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", first)
        )).toBe(true);
        expect(validateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", second)
        )).toBe(true);
    });

    it("preserves source values exactly without text normalization", () => {
        const puzzle = createSecureRelayPuzzle(productionSpec({
            intendedSolution: " Orchid 7 "
        }));
        const exact = encryptRsaOaep(RECIPIENT_KEYS.publicKey, "R7Q4M2: Orchid 7 ");
        const normalized = encryptRsaOaep(RECIPIENT_KEYS.publicKey, "R7Q4M2:ORCHID 7");

        expect(puzzle.solution.canonical).toBe("R7Q4M2: Orchid 7 ");
        expect(validateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", exact)
        )).toBe(true);
        expect(evaluateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", normalized)
        )).toEqual({ accepted: false, reason: "wrong-plaintext" });
    });

    it("rejects wrong recipients, payloads, keys, and malformed submissions", () => {
        const puzzle = createSecureRelayPuzzle(productionSpec());
        const wrongPayload = encryptRsaOaep(RECIPIENT_KEYS.publicKey, "R7Q4M2:TULIP");
        const wrongKey = encryptRsaOaep(IDENTITY_KEYS.publicKey, "R7Q4M2:ORCHID");

        expect(evaluateSecureRelaySubmission(
            puzzle,
            submission("REDWOOD", wrongPayload)
        )).toEqual({ accepted: false, reason: "wrong-recipient" });
        expect(evaluateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", wrongPayload)
        )).toEqual({ accepted: false, reason: "wrong-plaintext" });
        expect(evaluateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", wrongKey)
        )).toEqual({ accepted: false, reason: "decryption-failed" });
        expect(evaluateSecureRelaySubmission(puzzle, "not json"))
            .toEqual({ accepted: false, reason: "invalid-json" });
        expect(evaluateSecureRelaySubmission(
            puzzle,
            JSON.stringify({ recipient: "NIGHTINGALE", ciphertext: "***", extra: true })
        )).toEqual({ accepted: false, reason: "invalid-shape" });
        expect(evaluateSecureRelaySubmission(
            puzzle,
            submission("NIGHTINGALE", "not-base64")
        )).toEqual({ accepted: false, reason: "decryption-failed" });
    });

    it("rejects mismatched key pairs and inconsistent incoming orders", () => {
        expect(() => createSecureRelayPuzzle(productionSpec({
            impersonatedPublicKeyPem: RECIPIENT_KEYS.publicKey
        }))).toThrow("do not form a matching pair");

        expect(() => createSecureRelayPuzzle(productionSpec({
            incomingCiphertext: `${productionSpec().incomingCiphertext.slice(0, -4)}AAAA`
        }))).toThrow("cannot be decrypted");

        const differentInstruction = encryptRsaOaep(
            IDENTITY_KEYS.publicKey,
            "SECURE-RELAY/1\nNONCE=WRONG1\nRECIPIENT=NIGHTINGALE\nSOURCE=ARCHIVE-LOCKER\nFORMAT=<NONCE>:<SOURCE-VALUE>"
        );
        expect(() => createSecureRelayPuzzle(productionSpec({
            incomingCiphertext: differentInstruction
        }))).toThrow("does not contain the declared");
    });

    it("rejects non-RSA and undersized RSA keys", () => {
        const ec = generateKeyPairSync("ec", {
            namedCurve: "prime256v1",
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" }
        });
        expect(() => createSecureRelayPuzzle(productionSpec({
            impersonatedPublicKeyPem: ec.publicKey,
            impersonatedPrivateKeyPem: ec.privateKey
        }))).toThrow("must be an RSA key");

        const weak = generateKeyPairSync("rsa", {
            modulusLength: 1024,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" }
        });
        expect(() => createSecureRelayPuzzle(productionSpec({
            recipientPublicKeyPem: weak.publicKey,
            recipientPrivateKeyPem: weak.privateKey
        }))).toThrow("at least 2048 bits");
    });

    it("enforces the RSA-OAEP SHA-256 payload boundary", () => {
        expect(getRsaOaepMaxPlaintextBytes(RECIPIENT_KEYS.publicKey)).toBe(190);
        expect(() => createSecureRelayPuzzle(productionSpec({
            intendedSolution: "A".repeat(183)
        }))).not.toThrow();
        expect(() => createSecureRelayPuzzle(productionSpec({
            intendedSolution: "A".repeat(184)
        }))).toThrow("allows at most 190");
    });

    it("creates a safe public projection for production", () => {
        const puzzle = createSecureRelayPuzzle(productionSpec());
        const publicPuzzle = toPublicPuzzle(puzzle);
        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();

        const serialized = JSON.stringify(publicPuzzle);
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain(RECIPIENT_KEYS.publicKey);
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain(puzzle.inputs[1].value as string);
        expect(serialized).not.toContain(IDENTITY_KEYS.privateKey.slice(0, 80));
        expect(serialized).not.toContain(RECIPIENT_KEYS.privateKey.slice(0, 80));
        expect(serialized).not.toContain("R7Q4M2");
        expect(serialized).not.toContain("ORCHID");
        expect(serialized).not.toContain("ARCHIVE-LOCKER");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("extensions");
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
    });

    it("creates runtime demo cryptographic material without stored fixtures", async () => {
        const result = await createSecureRelayPuzzleTool.execute("demo-call", {
            mode: "demo",
            intendedSolution: "ORCHID",
            payloadReference: "ARCHIVE-LOCKER",
            privateKeyReference: "IDENTITY-CACHE",
            impersonatedIdentity: "FIELD-AGENT-7",
            nonce: "R7Q4M2",
            recipientId: "NIGHTINGALE"
        });

        expect(result.details.id).toBe("demo-secure-relay");
        expect(result.details.subtype).toBe("asymmetric-sealed-relay");
        expect(getPuzzleArtifactSource(result.details.artifact)).toContain("DEMO PREREQUISITES");
        expect(getPuzzleArtifactSource(result.details.artifact)).toContain("ORCHID");
    });

    it("does not allow normalized-text validation for secure relay puzzles", () => {
        const puzzle = createSecureRelayPuzzle(productionSpec());
        expect(() => validateNormalizedTextAnswer(puzzle, "R7Q4M2:ORCHID"))
            .toThrow("does not use normalized-text validation");
    });
});
