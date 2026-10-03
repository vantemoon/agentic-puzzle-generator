import Type, { type Static } from "typebox";

const closed = { additionalProperties: false } as const;

export const ScalarDataTypeSchema = Type.Union([Type.Literal("string"), Type.Literal("number")]);
export const DifficultyPresetSchema = Type.Union([
    Type.Literal("easy"), Type.Literal("medium"), Type.Literal("hard"), Type.Literal("custom")
]);
export const RatedDifficultySchema = Type.Union([
    Type.Literal("easy"), Type.Literal("medium"), Type.Literal("hard")
]);
export const HintPolicySchema = Type.Union([
    Type.Literal("explicit"), Type.Literal("contextual"), Type.Literal("hidden")
]);

const StringValueSchema = Type.Object({
    dataType: Type.Literal("string"),
    value: Type.String({ minLength: 1 })
}, closed);
const NumberValueSchema = Type.Object({
    dataType: Type.Literal("number"),
    value: Type.Number()
}, closed);
export const ScalarValueSchema = Type.Union([StringValueSchema, NumberValueSchema]);

export const VerificationSchema = Type.Union([
    Type.Object({
        prompt: Type.String({ minLength: 1 }),
        dataType: Type.Literal("string"),
        expectedValue: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        prompt: Type.String({ minLength: 1 }),
        dataType: Type.Literal("number"),
        expectedValue: Type.Number()
    }, closed)
]);

export const EnvironmentSchema = Type.Union([
    Type.Object({ mode: Type.Literal("self-contained") }, closed),
    Type.Object({
        mode: Type.Literal("external-public"),
        platforms: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
        deploymentAgentRequired: Type.Literal(true)
    }, closed)
]);

export const StructuralDifficultySchema = Type.Object({
    preset: DifficultyPresetSchema,
    puzzleCount: Type.Object({
        minimum: Type.Integer({ minimum: 1 }),
        maximum: Type.Integer({ minimum: 1 })
    }, closed),
    phaseCount: Type.Object({
        minimum: Type.Integer({ minimum: 1 }),
        maximum: Type.Integer({ minimum: 1 })
    }, closed),
    linearity: Type.Number({ minimum: 0, maximum: 1 }),
    maxParallelPuzzles: Type.Integer({ minimum: 1 })
}, closed);

export const PuzzleDifficultySchema = Type.Object({
    preset: DifficultyPresetSchema,
    hintPolicy: HintPolicySchema
}, closed);

export const TransformationPolicySchema = Type.Object({
    enabled: Type.Boolean(),
    maxCount: Type.Integer({ minimum: 0, maximum: 20 }),
    maxDifficulty: RatedDifficultySchema
}, closed);

export const LevelGenerationConfigSchema = Type.Object({
    structuralDifficulty: StructuralDifficultySchema,
    puzzleDifficulty: PuzzleDifficultySchema,
    transformationPolicy: TransformationPolicySchema,
    reviewRetryLimit: Type.Integer({ minimum: 0, maximum: 20 }),
    concealUnreachedContent: Type.Boolean(),
    encourageSubtypeVariety: Type.Boolean()
}, closed);

export const StartingInputSchema = Type.Union([
    Type.Object({
        id: Type.String({ minLength: 1 }), semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }), dataType: Type.Literal("string"),
        value: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        id: Type.String({ minLength: 1 }), semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }), dataType: Type.Literal("number"), value: Type.Number()
    }, closed)
]);

export const RequiredDiscoverySchema = Type.Union([
    Type.Object({
        id: Type.String({ minLength: 1 }), semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }), dataType: Type.Literal("string"),
        value: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        id: Type.String({ minLength: 1 }), semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }), dataType: Type.Literal("number"), value: Type.Number()
    }, closed)
]);

export const RequiredOutputSchema = Type.Union([
    Type.Object({
        id: Type.String({ minLength: 1 }),
        semanticRole: Type.String({ minLength: 1 }),
        dataType: Type.Literal("string"),
        requiredValue: Type.Optional(Type.String({ minLength: 1 }))
    }, closed),
    Type.Object({
        id: Type.String({ minLength: 1 }),
        semanticRole: Type.String({ minLength: 1 }),
        dataType: Type.Literal("number"),
        requiredValue: Type.Optional(Type.Number())
    }, closed)
]);

export const TerminalActionRequestSchema = Type.Object({
    actionType: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    requiredOutputs: Type.Array(RequiredOutputSchema, { minItems: 1 })
}, closed);

export const LevelDesignRequestSchema = Type.Object({
    levelId: Type.String({ minLength: 1 }),
    titleHint: Type.Optional(Type.String({ minLength: 1 })),
    genre: Type.Literal("online-investigation"),
    theme: Type.Optional(Type.String({ minLength: 1 })),
    setting: Type.Optional(Type.String({ minLength: 1 })),
    startingSituation: Type.String({ minLength: 1 }),
    playerRole: Type.String({ minLength: 1 }),
    playerCapabilities: Type.Array(Type.String({ minLength: 1 })),
    playerConstraints: Type.Array(Type.String({ minLength: 1 })),
    environment: EnvironmentSchema,
    narrativeContext: Type.Array(Type.String({ minLength: 1 })),
    startingInputs: Type.Array(StartingInputSchema),
    requiredDiscoveries: Type.Array(RequiredDiscoverySchema),
    terminalAction: TerminalActionRequestSchema,
    catalogVersion: Type.String({ minLength: 1 }),
    config: LevelGenerationConfigSchema
}, closed);

export const PhaseSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    order: Type.Integer({ minimum: 0 }),
    title: Type.String({ minLength: 1 }),
    summary: Type.String({ minLength: 1 })
}, closed);

export const PuzzleContentMockupSchema = Type.Union([
    Type.Object({
        kind: Type.Literal("text"),
        title: Type.Optional(Type.String({ minLength: 1 })),
        body: Type.String({ minLength: 1 }),
        emphasis: Type.Optional(Type.Union([
            Type.Literal("plain"), Type.Literal("acrostic"), Type.Literal("code"), Type.Literal("cipher")
        ]))
    }, closed),
    Type.Object({
        kind: Type.Literal("image-description"),
        description: Type.String({ minLength: 1 }),
        altText: Type.Optional(Type.String({ minLength: 1 }))
    }, closed),
    Type.Object({
        kind: Type.Literal("audio-description"),
        description: Type.String({ minLength: 1 }),
        transcript: Type.Optional(Type.String({ minLength: 1 }))
    }, closed),
    Type.Object({ kind: Type.Literal("structured"), data: Type.Unknown() }, closed)
]);

export const GeneratedContentSchema = Type.Object({
    status: Type.Union([Type.Literal("mockup"), Type.Literal("generated")]),
    preview: PuzzleContentMockupSchema
}, closed);

export const TransformationBindingSchema = Type.Object({
    type: Type.String({ minLength: 1 }),
    config: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
}, closed);

export const InputSourceSchema = Type.Union([
    Type.Object({
        kind: Type.Literal("puzzle-output"),
        puzzleId: Type.String({ minLength: 1 }),
        outputId: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        kind: Type.Literal("starting-input"),
        inputId: Type.String({ minLength: 1 })
    }, closed)
]);

export const PuzzleInputSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    source: InputSourceSchema,
    transform: Type.Optional(TransformationBindingSchema),
    use: Type.String({ minLength: 1 })
}, closed);

export const PuzzleOutputSchema = Type.Union([
    Type.Object({
        id: Type.String({ minLength: 1 }),
        semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }),
        from: Type.Literal("verification"),
        requiredDiscoveryId: Type.Optional(Type.String({ minLength: 1 }))
    }, closed),
    Type.Object({
        id: Type.String({ minLength: 1 }),
        semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }),
        from: Type.Literal("revealed"),
        dataType: Type.Literal("string"),
        value: Type.String({ minLength: 1 }),
        requiredDiscoveryId: Type.Optional(Type.String({ minLength: 1 }))
    }, closed),
    Type.Object({
        id: Type.String({ minLength: 1 }),
        semanticRole: Type.String({ minLength: 1 }),
        description: Type.String({ minLength: 1 }),
        from: Type.Literal("revealed"),
        dataType: Type.Literal("number"),
        value: Type.Number(),
        requiredDiscoveryId: Type.Optional(Type.String({ minLength: 1 }))
    }, closed)
]);

export const PuzzleDesignSchema = Type.Object({
    puzzleType: Type.String({ minLength: 1 }),
    subtype: Type.String({ minLength: 1 }),
    difficulty: RatedDifficultySchema,
    hintPolicy: HintPolicySchema,
    generationSpec: Type.Record(Type.String(), Type.Unknown()),
    verification: VerificationSchema,
    inputs: Type.Array(PuzzleInputSchema),
    outputs: Type.Array(PuzzleOutputSchema, { minItems: 1 }),
    revealContext: Type.Optional(Type.String({ minLength: 1 })),
    duplicateAnswerJustification: Type.Optional(Type.String({ minLength: 1 }))
}, closed);

export const PuzzleNodeSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    phaseId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    purpose: Type.String({ minLength: 1 }),
    design: PuzzleDesignSchema,
    generatedContent: Type.Optional(GeneratedContentSchema)
}, closed);

export const OutputReferenceSchema = Type.Object({
    puzzleId: Type.String({ minLength: 1 }),
    outputId: Type.String({ minLength: 1 })
}, closed);

export const TerminalFieldSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    semanticRole: Type.String({ minLength: 1 }),
    source: OutputReferenceSchema
}, closed);

export const TerminalActionSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    actionType: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    interaction: Type.Literal("exact-field-form"),
    fields: Type.Array(TerminalFieldSchema, { minItems: 1 }),
    successOutcome: Type.String({ minLength: 1 })
}, closed);

export const ExternalContentRequirementSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    platform: Type.String({ minLength: 1 }),
    contentKind: Type.String({ minLength: 1 }),
    fictionalContentSummary: Type.String({ minLength: 1 }),
    status: Type.Union([Type.Literal("planned"), Type.Literal("deployed")]),
    url: Type.Optional(Type.String({ minLength: 1 })),
    cleanupPolicy: Type.Optional(Type.String({ minLength: 1 }))
}, closed);

export const LevelBlueprintSchema = Type.Object({
    schemaVersion: Type.String({ minLength: 1 }),
    catalogVersion: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    summary: Type.String({ minLength: 1 }),
    genre: Type.Literal("online-investigation"),
    environment: EnvironmentSchema,
    setting: Type.Object({
        theme: Type.String({ minLength: 1 }),
        location: Type.String({ minLength: 1 }),
        tone: Type.String({ minLength: 1 })
    }, closed),
    startingSituation: Type.String({ minLength: 1 }),
    playerRole: Type.String({ minLength: 1 }),
    playerCapabilities: Type.Array(Type.String({ minLength: 1 })),
    playerConstraints: Type.Array(Type.String({ minLength: 1 })),
    startingInputs: Type.Array(StartingInputSchema),
    generationConfig: LevelGenerationConfigSchema,
    phases: Type.Array(PhaseSchema, { minItems: 1 }),
    puzzles: Type.Array(PuzzleNodeSchema, { minItems: 1 }),
    terminalAction: TerminalActionSchema,
    externalContentRequirements: Type.Array(ExternalContentRequirementSchema)
}, closed);

export const ReviewIssueSchema = Type.Object({
    severity: Type.Union([Type.Literal("error"), Type.Literal("warning"), Type.Literal("suggestion")]),
    code: Type.String({ minLength: 1 }),
    nodeId: Type.Optional(Type.String({ minLength: 1 })),
    message: Type.String({ minLength: 1 }),
    suggestedFix: Type.String({ minLength: 1 })
}, closed);

export const LevelReviewSchema = Type.Object({
    levelId: Type.String({ minLength: 1 }),
    attempt: Type.Integer({ minimum: 1 }),
    accepted: Type.Boolean(),
    summary: Type.String({ minLength: 1 }),
    issues: Type.Array(ReviewIssueSchema)
}, closed);

export const LevelDesignFailureSchema = Type.Object({
    schemaVersion: Type.String({ minLength: 1 }),
    status: Type.Literal("needs-game-design-revision"),
    requestId: Type.String({ minLength: 1 }),
    reasonCode: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    blockedRequirement: Type.String({ minLength: 1 }),
    attemptedAlternatives: Type.Array(Type.String({ minLength: 1 })),
    suggestions: Type.Array(Type.Object({
        change: Type.String({ minLength: 1 }),
        impact: Type.String({ minLength: 1 })
    }, closed), { minItems: 1 })
}, closed);

export const LevelPatchOperationSchema = Type.Union([
    Type.Object({
        op: Type.Union([Type.Literal("add"), Type.Literal("replace")]),
        path: Type.String({ pattern: "^/" }),
        value: Type.Unknown(),
        reason: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        op: Type.Literal("remove"),
        path: Type.String({ pattern: "^/" }),
        reason: Type.String({ minLength: 1 })
    }, closed)
]);

export const LevelPatchSchema = Type.Object({
    levelId: Type.String({ minLength: 1 }),
    baseSchemaVersion: Type.String({ minLength: 1 }),
    mode: Type.Union([Type.Literal("progress-preserving"), Type.Literal("full-regeneration")]),
    unrecoverableIssue: Type.Optional(Type.String({ minLength: 1 })),
    completedPuzzleIds: Type.Array(Type.String({ minLength: 1 })),
    operations: Type.Array(LevelPatchOperationSchema, { minItems: 1 })
}, closed);

export const GameLevelEntrySchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    parentLevelId: Type.Optional(Type.String({ minLength: 1 })),
    prerequisiteLevelIds: Type.Array(Type.String({ minLength: 1 })),
    levelFile: Type.String({ minLength: 1 })
}, closed);

export const GameLevelManifestSchema = Type.Object({
    schemaVersion: Type.Literal("1.0.0"),
    gameId: Type.String({ minLength: 1 }),
    levels: Type.Array(GameLevelEntrySchema, { minItems: 1 })
}, closed);

export type ScalarDataType = Static<typeof ScalarDataTypeSchema>;
export type ScalarValue = Static<typeof ScalarValueSchema>;
export type Verification = Static<typeof VerificationSchema>;
export type Environment = Static<typeof EnvironmentSchema>;
export type LevelGenerationConfig = Static<typeof LevelGenerationConfigSchema>;
export type StartingInput = Static<typeof StartingInputSchema>;
export type RequiredDiscovery = Static<typeof RequiredDiscoverySchema>;
export type LevelDesignRequest = Static<typeof LevelDesignRequestSchema>;
export type PuzzleContentMockup = Static<typeof PuzzleContentMockupSchema>;
export type Phase = Static<typeof PhaseSchema>;
export type PuzzleInput = Static<typeof PuzzleInputSchema>;
export type PuzzleOutput = Static<typeof PuzzleOutputSchema>;
export type PuzzleNode = Static<typeof PuzzleNodeSchema>;
export type TerminalAction = Static<typeof TerminalActionSchema>;
export type LevelBlueprint = Static<typeof LevelBlueprintSchema>;
export type LevelReview = Static<typeof LevelReviewSchema>;
export type LevelDesignFailure = Static<typeof LevelDesignFailureSchema>;
export type LevelPatch = Static<typeof LevelPatchSchema>;
export type GameLevelManifest = Static<typeof GameLevelManifestSchema>;

export const LEVEL_SCHEMA_VERSION = "3.0.0";
