import { Type, type Static, type TSchema, type TUnion, type TUnsafe } from "typebox";

type TObjectUnion<TSchemas extends TSchema[]> = TUnsafe<Static<TUnion<TSchemas>>> & {
    type: "object";
    anyOf: TSchemas;
};

/** A TypeBox union whose JSON Schema root is explicitly an object. */
export function objectUnion<const TSchemas extends TSchema[]>(schemas: [...TSchemas]): TObjectUnion<TSchemas> {
    const union = Type.Union(schemas);
    return Type.Unsafe<Static<typeof union>>({ ...union, type: "object" }) as TObjectUnion<TSchemas>;
}
