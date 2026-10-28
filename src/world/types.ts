import Type, { type Static } from "typebox";

const closed = { additionalProperties: false } as const;

export const WORLD_SCHEMA_VERSION = "1.0.0";

export const WorldEntityTypeSchema = Type.Union([
    Type.Literal("person"),
    Type.Literal("organization"),
    Type.Literal("place"),
    Type.Literal("object"),
    Type.Literal("event"),
    Type.Literal("site")
]);

export const WorldEntitySchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    type: WorldEntityTypeSchema,
    name: Type.String({ minLength: 1 }),
    subtype: Type.Optional(Type.String({ minLength: 1 })),
    description: Type.Optional(Type.String({ minLength: 1 }))
}, closed);

export const WorldFactValueSchema = Type.Union([
    Type.Object({
        kind: Type.Literal("entity"),
        entityId: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        kind: Type.Literal("literal"),
        value: Type.Union([
            Type.String({ minLength: 1 }),
            Type.Number(),
            Type.Boolean()
        ])
    }, closed)
]);

const calendarDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const WorldFactSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
    subjectId: Type.String({ minLength: 1 }),
    relation: Type.String({ minLength: 1 }),
    value: WorldFactValueSchema,
    validFrom: Type.Optional(calendarDate),
    validTo: Type.Optional(calendarDate)
}, closed);

export const GameWorldSchema = Type.Object({
    schemaVersion: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
    revision: Type.String({ minLength: 1 }),
    entities: Type.Array(WorldEntitySchema),
    facts: Type.Array(WorldFactSchema)
}, closed);

export type WorldEntityType = Static<typeof WorldEntityTypeSchema>;
export type WorldEntity = Static<typeof WorldEntitySchema>;
export type WorldFactValue = Static<typeof WorldFactValueSchema>;
export type WorldFact = Static<typeof WorldFactSchema>;
export type GameWorld = Static<typeof GameWorldSchema>;
