import { describe, expect, it } from "vitest";
import {
    loadModelConfigurationFile,
    normalizeKadiToolSchemas,
    parseModelConfigurationFile,
    resolveModelConfiguration,
} from "../src/core/model.js";

describe("resolveModelConfiguration", () => {
    it("uses Qwen Flash for visual composition and the default for deterministic images", () => {
        const configuration = loadModelConfigurationFile();
        const deterministicImageSubtypes = [
            "alpha-channel",
            "color-channel",
            "qr-code",
            "steganography",
        ];

        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "visual-clue" }, configuration)).toEqual({
            modelId: "humin/Qwen3.8-Flash-Next-oQ4e-mtp",
            providerId: "kadi",
        });
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "alt-text" }, configuration)).toEqual({
            modelId: "humin/Qwen3.8-Flash-Next-oQ4e-mtp",
            providerId: "kadi",
        });
        for (const subtype of deterministicImageSubtypes) {
            expect(resolveModelConfiguration({ kind: "puzzle", subtype }, configuration), subtype).toEqual({
                modelId: "moonshot/kimi-k3",
                providerId: "kadi",
            });
        }
    });

    it("uses the task-specific level model before the global model", () => {
        expect(resolveModelConfiguration("level-design", {
            default: { modelId: "global-model", providerId: "provider" },
            tasks: { "level-design": { modelId: "complex-model" } },
        })).toEqual({ modelId: "complex-model", providerId: "provider" });
    });

    it("uses a subtype model before the puzzle and global defaults", () => {
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "caesar-cipher" }, {
            default: { modelId: "global-model", providerId: "provider" },
            puzzles: {
                default: { modelId: "puzzle-model" },
                "caesar-cipher": { modelId: "caesar-model" },
            },
        })).toEqual({ modelId: "caesar-model", providerId: "provider" });
    });

    it("uses an authored-content model between subtype and puzzle defaults", () => {
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "alt-text" }, {
            default: { modelId: "global-model", providerId: "provider" },
            puzzles: {
                default: { modelId: "puzzle-model" },
                "visual-composition": { modelId: "visual-model" },
            },
        })).toEqual({ modelId: "visual-model", providerId: "provider" });
    });

    it("falls back independently for model and provider settings", () => {
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "visual-clue" }, {
            default: { modelId: "global-model", providerId: "global-provider" },
            puzzles: {
                default: { modelId: "puzzle-model" },
                "visual-clue": { providerId: "special-provider" },
            },
        })).toEqual({ modelId: "puzzle-model", providerId: "special-provider" });
    });

    it("resolves subtype, puzzle, and global values from the config file", () => {
        const configuration = parseModelConfigurationFile({
            default: { modelId: "default-model", providerId: "default-provider" },
            puzzles: {
                default: { modelId: "puzzle-model" },
                "visual-clue": { providerId: "visual-provider" },
            },
        });

        expect(resolveModelConfiguration(
            { kind: "puzzle", subtype: "visual-clue" },
            configuration
        )).toEqual({ modelId: "puzzle-model", providerId: "visual-provider" });
    });

    it("rejects misspelled task names in the config file", () => {
        expect(() => parseModelConfigurationFile({
            default: { modelId: "model", providerId: "provider" },
            tasks: { levelDesign: { modelId: "model" } },
        })).toThrow("tasks has unknown field: levelDesign");
    });
});

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
