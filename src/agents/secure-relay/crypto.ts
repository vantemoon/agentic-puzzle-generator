import {
    constants,
    createPrivateKey,
    createPublicKey,
    privateDecrypt,
    publicEncrypt,
    timingSafeEqual,
    type KeyObject
} from "node:crypto";

const OAEP_HASH = "sha256";
const SHA256_LENGTH = 32;
const MIN_RSA_MODULUS_BITS = 2048;

function assertRsaKey(key: KeyObject, label: string): void {
    if (key.asymmetricKeyType !== "rsa") {
        throw new Error(`${label} must be an RSA key.`);
    }

    const modulusLength = key.asymmetricKeyDetails?.modulusLength;
    if (modulusLength === undefined || modulusLength < MIN_RSA_MODULUS_BITS) {
        throw new Error(
            `${label} must use an RSA modulus of at least ${MIN_RSA_MODULUS_BITS} bits.`
        );
    }
}

export function parseRsaPublicKey(publicKeyPem: string, label: string): KeyObject {
    let key: KeyObject;
    try {
        key = createPublicKey(publicKeyPem);
    } catch {
        throw new Error(`${label} is not a valid PEM public key.`);
    }
    assertRsaKey(key, label);
    return key;
}

export function parseRsaPrivateKey(privateKeyPem: string, label: string): KeyObject {
    let key: KeyObject;
    try {
        key = createPrivateKey(privateKeyPem);
    } catch {
        throw new Error(`${label} is not a valid unencrypted PEM private key.`);
    }
    assertRsaKey(key, label);
    return key;
}

export function assertMatchingRsaKeyPair(
    publicKeyPem: string,
    privateKeyPem: string,
    label: string
): void {
    const suppliedPublicKey = parseRsaPublicKey(publicKeyPem, `${label} public key`);
    const privateKey = parseRsaPrivateKey(privateKeyPem, `${label} private key`);
    const derivedPublicKey = createPublicKey(privateKey);

    const suppliedDer = suppliedPublicKey.export({ type: "spki", format: "der" });
    const derivedDer = derivedPublicKey.export({ type: "spki", format: "der" });
    if (suppliedDer.length !== derivedDer.length || !timingSafeEqual(suppliedDer, derivedDer)) {
        throw new Error(`${label} public and private keys do not form a matching pair.`);
    }
}

export function getRsaModulusBytes(key: KeyObject): number {
    const modulusLength = key.asymmetricKeyDetails?.modulusLength;
    if (modulusLength === undefined || modulusLength % 8 !== 0) {
        throw new Error("RSA key has an unsupported modulus length.");
    }
    return modulusLength / 8;
}

export function getRsaOaepMaxPlaintextBytes(publicKeyPem: string): number {
    const key = parseRsaPublicKey(publicKeyPem, "RSA-OAEP public key");
    return getRsaModulusBytes(key) - 2 * SHA256_LENGTH - 2;
}

export function decodeCanonicalBase64(input: string): Buffer {
    const value = input.trim();
    const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (value.length === 0 || !base64Pattern.test(value)) {
        throw new Error("Ciphertext must be canonical Base64.");
    }

    const decoded = Buffer.from(value, "base64");
    if (decoded.toString("base64") !== value) {
        throw new Error("Ciphertext must be canonical Base64.");
    }
    return decoded;
}

export function encryptRsaOaep(publicKeyPem: string, plaintext: string): string {
    const publicKey = parseRsaPublicKey(publicKeyPem, "Encryption public key");
    const plaintextBytes = Buffer.from(plaintext, "utf8");
    const maximumBytes = getRsaModulusBytes(publicKey) - 2 * SHA256_LENGTH - 2;
    if (plaintextBytes.length > maximumBytes) {
        throw new Error(`Plaintext must not exceed ${maximumBytes} UTF-8 bytes.`);
    }

    return publicEncrypt(
        {
            key: publicKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: OAEP_HASH
        },
        plaintextBytes
    ).toString("base64");
}

export function decryptRsaOaep(privateKeyPem: string, ciphertext: string): Buffer {
    const privateKey = parseRsaPrivateKey(privateKeyPem, "Decryption private key");
    const ciphertextBytes = decodeCanonicalBase64(ciphertext);
    if (ciphertextBytes.length !== getRsaModulusBytes(privateKey)) {
        throw new Error("Ciphertext length does not match the RSA key modulus.");
    }

    return privateDecrypt(
        {
            key: privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: OAEP_HASH
        },
        ciphertextBytes
    );
}
