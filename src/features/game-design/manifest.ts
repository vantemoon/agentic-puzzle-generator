import Type, { type Static } from "typebox";

const closed = { additionalProperties: false } as const;
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

export type GameLevelManifest = Static<typeof GameLevelManifestSchema>;


