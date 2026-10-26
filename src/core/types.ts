import { Buffer } from "node:buffer";

import Type, { type Static } from "typebox";
import Value from "typebox/value";

const closed = { additionalProperties: false } as const;

export const PuzzleGenerationSpecSchema = Type.Object(
    {
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1 })
    },
    closed
);

export const PuzzlePortSchema = Type.Object(
    {
        key: Type.String({ minLength: 1 }),
        valueType: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }),
        required: Type.Optional(Type.Boolean()),
        constraints: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        value: Type.Optional(Type.Unknown())
    },
    closed
);

export const PublicPuzzlePortSchema = Type.Object(
    {
        key: Type.String({ minLength: 1 }),
        valueType: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }),
        required: Type.Optional(Type.Boolean()),
        constraints: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
    },
    closed
);

export const TextPuzzleArtifactSchema = Type.Object(
    {
        kind: Type.Literal("text"),
        mediaType: Type.Literal("text/plain"),
        source: Type.String({ minLength: 1 })
    },
    closed
);

export const HtmlPuzzleArtifactFileSchema = Type.Object(
    {
        path: Type.String({ minLength: 1 }),
        mediaType: Type.Literal("text/html"),
        source: Type.String({ minLength: 1 })
    },
    closed
);

export const SvgImagePuzzleArtifactSchema = Type.Object(
    {
        kind: Type.Literal("image"),
        mediaType: Type.Literal("image/svg+xml"),
        source: Type.String({ minLength: 1 })
    },
    closed
);

export const PngImagePuzzleArtifactSchema = Type.Object(
    {
        kind: Type.Literal("image"),
        mediaType: Type.Literal("image/png"),
        encoding: Type.Literal("base64"),
        data: Type.String({ minLength: 1 })
    },
    closed
);

export const WavAudioPuzzleArtifactSchema = Type.Object(
    {
        kind: Type.Literal("audio"),
        mediaType: Type.Literal("audio/wav"),
        encoding: Type.Literal("base64"),
        data: Type.String({ minLength: 1 })
    },
    closed
);

export const HtmlPuzzleArtifactSchema = Type.Object(
    {
        kind: Type.Literal("html"),
        mediaType: Type.Literal("text/html"),
        entryPath: Type.String({ minLength: 1 }),
        files: Type.Array(HtmlPuzzleArtifactFileSchema, { minItems: 1 })
    },
    closed
);

export const PuzzleArtifactSchema = Type.Union([
    TextPuzzleArtifactSchema,
    HtmlPuzzleArtifactSchema,
    SvgImagePuzzleArtifactSchema,
    PngImagePuzzleArtifactSchema,
    WavAudioPuzzleArtifactSchema
]);

export const TextSolutionSchema = Type.Object(
    {
        valueType: Type.Literal("text"),
        canonical: Type.String({ minLength: 1 }),
        acceptedAlternatives: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
        normalization: Type.Array(
            Type.Union([
                Type.Literal("trim"),
                Type.Literal("case-insensitive"),
                Type.Literal("collapse-whitespace")
            ])
        )
    },
    closed
);

export const NormalizedTextValidatorSchema = Type.Object(
    {
        kind: Type.Literal("normalized-text"),
        mode: Type.Literal("deterministic"),
        options: Type.Object(
            {
                trim: Type.Boolean(),
                caseInsensitive: Type.Boolean(),
                collapseWhitespace: Type.Boolean()
            },
            closed
        )
    },
    closed
);

export const SecureRelayValidatorSchema = Type.Object(
    {
        kind: Type.Literal("secure-relay"),
        mode: Type.Literal("deterministic"),
        options: Type.Object(
            {
                expectedRecipient: Type.String({ minLength: 1 }),
                expectedNonce: Type.String({ minLength: 1 }),
                expectedPlaintext: Type.String({ minLength: 1 }),
                recipientPrivateKeyPem: Type.String({ minLength: 1 }),
                encryption: Type.Literal("rsa-oaep"),
                oaepHash: Type.Literal("sha256"),
                plaintextEncoding: Type.Literal("utf8"),
                ciphertextEncoding: Type.Literal("base64")
            },
            closed
        )
    },
    closed
);

export const ValidatorSchema = Type.Union([
    NormalizedTextValidatorSchema,
    SecureRelayValidatorSchema
]);

const ExternalKnowledgeProvenanceSchema = Type.Object(
    {
        sourceId: Type.String({ minLength: 1 }),
        retrievedValue: Type.Unknown(),
        retrievedAt: Type.Optional(Type.String({ minLength: 1 }))
    },
    closed
);

export const PrivateExternalKnowledgeSchema = Type.Union([
    Type.Object({ required: Type.Literal(false) }, closed),
    Type.Object(
        {
            required: Type.Literal(true),
            provenance: Type.Array(ExternalKnowledgeProvenanceSchema, { minItems: 1 })
        },
        closed
    )
]);

export const PublicExternalKnowledgeSchema = Type.Object(
    { required: Type.Boolean() },
    closed
);

export const PrivatePuzzleInstanceSchema = Type.Object(
    {
        id: Type.String({ minLength: 1 }),
        puzzleType: Type.String({ minLength: 1 }),
        subtype: Type.String({ minLength: 1 }),
        inputs: Type.Array(PuzzlePortSchema),
        outputs: Type.Array(PuzzlePortSchema),
        artifact: PuzzleArtifactSchema,
        prompt: Type.String({ minLength: 1 }),
        solution: TextSolutionSchema,
        validator: ValidatorSchema,
        externalKnowledge: PrivateExternalKnowledgeSchema,
        extensions: Type.Record(Type.String(), Type.Unknown())
    },
    closed
);

export const PublicPuzzleInstanceSchema = Type.Object(
    {
        id: Type.String({ minLength: 1 }),
        puzzleType: Type.String({ minLength: 1 }),
        subtype: Type.String({ minLength: 1 }),
        inputs: Type.Array(PublicPuzzlePortSchema),
        outputs: Type.Array(PublicPuzzlePortSchema),
        artifact: PuzzleArtifactSchema,
        prompt: Type.String({ minLength: 1 }),
        externalKnowledge: PublicExternalKnowledgeSchema
    },
    closed
);

export type PuzzleGenerationSpec = Static<typeof PuzzleGenerationSpecSchema>;
export type PuzzlePort = Static<typeof PuzzlePortSchema>;
export type HtmlPuzzleArtifact = Static<typeof HtmlPuzzleArtifactSchema>;
export type HtmlPuzzleArtifactFile = Static<typeof HtmlPuzzleArtifactFileSchema>;
export type SvgImagePuzzleArtifact = Static<typeof SvgImagePuzzleArtifactSchema>;
export type PngImagePuzzleArtifact = Static<typeof PngImagePuzzleArtifactSchema>;
export type WavAudioPuzzleArtifact = Static<typeof WavAudioPuzzleArtifactSchema>;
export type PuzzleArtifact = Static<typeof PuzzleArtifactSchema>;
export type PrivatePuzzleInstance = Static<typeof PrivatePuzzleInstanceSchema>;
export type PublicPuzzleInstance = Static<typeof PublicPuzzleInstanceSchema>;

export function createSvgImageArtifact(source: string): SvgImagePuzzleArtifact {
    return { kind: "image", mediaType: "image/svg+xml", source };
}

export function getSvgImageSource(artifact: PuzzleArtifact): string {
    if (artifact.kind !== "image" || artifact.mediaType !== "image/svg+xml") {
        throw new Error("Expected an SVG image artifact.");
    }
    return artifact.source;
}

function assertBase64PngData(data: string): void {
    if (data.startsWith("data:")) {
        throw new Error("PNG image artifacts must store raw base64 data, not data URLs.");
    }
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new Error("PNG image artifacts must use valid base64 data.");
    }
    const bytes = Buffer.from(data, "base64");
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < pngSignature.length || !pngSignature.every((byte, index) => bytes[index] === byte)) {
        throw new Error("PNG image artifacts must contain PNG data.");
    }
}

export function createPngImageArtifact(data: string): PngImagePuzzleArtifact {
    assertBase64PngData(data);
    return { kind: "image", mediaType: "image/png", encoding: "base64", data };
}

export function getPngImageData(artifact: PuzzleArtifact): string {
    if (artifact.kind !== "image" || artifact.mediaType !== "image/png") {
        throw new Error("Expected a PNG image artifact.");
    }
    return artifact.data;
}

function assertBase64WavData(data: string): void {
    if (data.startsWith("data:")) {
        throw new Error("WAV audio artifacts must store raw base64 data, not data URLs.");
    }
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new Error("WAV audio artifacts must use valid base64 data.");
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length < 12 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
        throw new Error("WAV audio artifacts must contain RIFF/WAVE data.");
    }
}

export function createWavAudioArtifact(data: string): WavAudioPuzzleArtifact {
    assertBase64WavData(data);
    return { kind: "audio", mediaType: "audio/wav", encoding: "base64", data };
}

export function getWavAudioData(artifact: PuzzleArtifact): string {
    if (artifact.kind !== "audio" || artifact.mediaType !== "audio/wav") {
        throw new Error("Expected a WAV audio artifact.");
    }
    return artifact.data;
}

export function createHtmlArtifact(options: {
    entryPath: string;
    files: HtmlPuzzleArtifactFile[];
}): HtmlPuzzleArtifact {
    const seenPaths = new Set<string>();
    for (const file of options.files) {
        if (!file.path.startsWith("/") || file.path.includes("..") || file.path.includes("\\")) {
            throw new Error("HTML artifact file paths must be absolute safe web paths.");
        }
        if (seenPaths.has(file.path)) {
            throw new Error("HTML artifact file paths must be unique.");
        }
        seenPaths.add(file.path);
    }
    if (!seenPaths.has(options.entryPath)) {
        throw new Error("HTML artifact entryPath must match one artifact file.");
    }

    return {
        kind: "html",
        mediaType: "text/html",
        entryPath: options.entryPath,
        files: options.files
    };
}

export function createSingleHtmlArtifact(
    source: string,
    entryPath = "/index.html"
): HtmlPuzzleArtifact {
    return createHtmlArtifact({
        entryPath,
        files: [{ path: entryPath, mediaType: "text/html", source }]
    });
}

export function getHtmlEntryFile(artifact: PuzzleArtifact): HtmlPuzzleArtifactFile {
    if (artifact.kind !== "html") {
        throw new Error("Expected an HTML artifact.");
    }

    const entryFile = artifact.files.find((file) => file.path === artifact.entryPath);
    if (entryFile === undefined) {
        throw new Error("HTML artifact entryPath must match one artifact file.");
    }
    return entryFile;
}

export function getHtmlEntrySource(artifact: PuzzleArtifact): string {
    return getHtmlEntryFile(artifact).source;
}

export function getPuzzleArtifactSource(artifact: PuzzleArtifact): string {
    if (artifact.kind === "text") return artifact.source;
    if (artifact.kind === "image") {
        return artifact.mediaType === "image/svg+xml" ? artifact.source : artifact.data;
    }
    if (artifact.kind === "audio") return artifact.data;
    return getHtmlEntrySource(artifact);
}

export function assertPrivatePuzzleInstance(value: unknown): asserts value is PrivatePuzzleInstance {
    if (!isPrivatePuzzleInstance(value)) {
        throw new Error("Puzzle does not satisfy the private puzzle schema.");
    }
}

export function isPrivatePuzzleInstance(value: unknown): value is PrivatePuzzleInstance {
    return Value.Check(PrivatePuzzleInstanceSchema, value);
}

export function assertPublicPuzzleInstance(value: unknown): asserts value is PublicPuzzleInstance {
    if (!Value.Check(PublicPuzzleInstanceSchema, value)) {
        throw new Error("Puzzle does not satisfy the public puzzle schema.");
    }
}

export function toPublicPuzzle(puzzle: PrivatePuzzleInstance): PublicPuzzleInstance {
    const stripValue = ({ value: _value, ...port }: PuzzlePort) => port;
    const publicPuzzle: PublicPuzzleInstance = {
        id: puzzle.id,
        puzzleType: puzzle.puzzleType,
        subtype: puzzle.subtype,
        inputs: puzzle.inputs.map(stripValue),
        outputs: puzzle.outputs.map(stripValue),
        artifact: puzzle.artifact,
        prompt: puzzle.prompt,
        externalKnowledge: { required: puzzle.externalKnowledge.required }
    };

    assertPublicPuzzleInstance(publicPuzzle);
    return publicPuzzle;
}

export function validateNormalizedTextAnswer(
    puzzle: PrivatePuzzleInstance,
    answer: string
): boolean {
    if (puzzle.validator.kind !== "normalized-text") {
        throw new Error("Puzzle does not use normalized-text validation.");
    }
    const options = puzzle.validator.options;
    if (!("trim" in options)) {
        throw new Error("Puzzle has invalid normalized-text validator options.");
    }

    const normalize = (value: string): string => {
        let result = value;
        if (options.trim) result = result.trim();
        if (options.collapseWhitespace) result = result.replace(/\s+/g, " ");
        if (options.caseInsensitive) result = result.toUpperCase();
        return result;
    };

    const accepted = [
        puzzle.solution.canonical,
        ...(puzzle.solution.acceptedAlternatives ?? [])
    ];
    return accepted.some((candidate) => normalize(candidate) === normalize(answer));
}
