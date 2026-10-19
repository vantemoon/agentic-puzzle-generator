import { describe, expect, it } from "vitest";
import { normalizeKadiToolSchemas } from "../src/core/model.js";

describe("normalizeKadiToolSchemas", () => {
    it("adds the object root required by Kadi to TypeBox union tool schemas", () => {
        const anyOf = [
            { type: "object", properties: { mode: { const: "production" } }, required: ["mode"] },
            { type: "object", properties: { mode: { const: "demo" } }, required: ["mode"] },
        ];
        const payload = {
            model: "moonshot/kimi-k2.6",
            tools: [{
                type: "function",
                function: {
                    name: "create_caesar_puzzle",
                    parameters: { anyOf },
                },
            }],
        };

        const normalized = normalizeKadiToolSchemas(payload) as typeof payload & {
            tools: Array<{ function: { parameters: { type: string; anyOf: typeof anyOf } } }>;
        };

        expect(normalized.tools[0].function.parameters).toEqual({ anyOf, type: "object" });
        expect(payload.tools[0].function.parameters).toEqual({ anyOf });
    });

    it("leaves ordinary object tool schemas unchanged", () => {
        const payload = {
            tools: [{
                type: "function",
                function: {
                    name: "create_visual_clue_puzzle",
                    parameters: { type: "object", properties: {} },
                },
            }],
        };

        expect(normalizeKadiToolSchemas(payload)).toBe(payload);
    });
});
