import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CredentialStore } from "@earendil-works/pi-ai";
import type { ModelRuntime as Runtime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
    loadModelConfigurationFile,
    isRetryableModelError,
    normalizeKadiToolSchemas,
    parseModelConfigurationFile,
    resolveModelConfiguration,
} from "../src/shared/agent-runtime/model.js";

describe("installed Pi SDK compatibility", () => {
    it("loads the runtime and read-only credentials used by agent startup without network access", async () => {
        const temporary = await mkdtemp(path.join(os.tmpdir(), "puzzle-sdk-"));
        try {
            const entry = import.meta.resolve("@earendil-works/pi-coding-agent");
            const { ModelRuntime } = await import(new URL("./core/model-runtime.js", entry).href) as {
                ModelRuntime: typeof Runtime;
            };
            const { ReadOnlyAuthStorage } = await import(new URL("./core/auth-storage.js", entry).href) as {
                ReadOnlyAuthStorage: new (file: string) => CredentialStore;
            };
            const credentials = new ReadOnlyAuthStorage(path.join(temporary, "absent-auth.json"));
            expect(await credentials.list()).toEqual([]);
            const runtime = await ModelRuntime.create({
                credentials,
                modelsPath: null,
                modelsStorePath: path.join(temporary, "models.json"),
                allowModelNetwork: false,
                refreshOnCreate: false
            });
            expect(typeof runtime.streamSimple).toBe("function");
            expect(typeof runtime.generateImages).toBe("function");
            expect(runtime.getModel("unconfigured-test-provider", "missing-model")).toBeUndefined();
            expect(await runtime.getAuth("unconfigured-test-provider")).toBeUndefined();
        } finally {
            await rm(temporary, { recursive: true, force: true });
        }
    });
});

describe("model provider errors", () => {
    it("retries temporary availability errors but not ordinary validation failures", () => {
        expect(isRetryableModelError(new Error(
            'kadi-openai API error (404): {"code":"model_not_found","message":"No such model"}'
        ))).toBe(true);
        expect(isRetryableModelError(new Error("kadi API error (503): unavailable"))).toBe(true);
        expect(isRetryableModelError(new Error("Connection error"))).toBe(true);
        expect(isRetryableModelError(new Error("Request timed out."))).toBe(true);
        expect(isRetryableModelError(new Error("request failed: ETIMEDOUT"))).toBe(true);
        expect(isRetryableModelError(new Error('429: {"message":"The engine is currently overloaded, please try again later","type":"engine_overloaded_error"}'))).toBe(true);
        expect(isRetryableModelError(new Error('429: {"message":"Too many requests"}'))).toBe(true);
        expect(isRetryableModelError(new Error('400: {"message":"Invalid tool schema"}'))).toBe(false);
        expect(isRetryableModelError(new Error("Puzzle schema was rejected"))).toBe(false);
    });
});

describe("resolveModelConfiguration", () => {
    it("uses the configured visual-composition model and the default for deterministic images", () => {
        const configuration = loadModelConfigurationFile();
        const deterministicImageSubtypes = [
            "alpha-channel",
            "color-channel",
            "qr-code",
            "steganography",
        ];

        const visualModel = configuration.puzzles?.["visual-composition"];
        expect(visualModel?.modelId).toBeDefined();
        expect(visualModel?.providerId).toBeDefined();
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "visual-clue" }, configuration))
            .toEqual(visualModel);
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "alt-text" }, configuration))
            .toEqual(visualModel);
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

    it("configures each supporting-media mode independently", () => {
        const configuration = loadModelConfigurationFile();
        for (const task of [
            "supporting-media-raster",
            "supporting-media-svg",
            "supporting-media-document"
        ] as const) {
            const configured = configuration.tasks?.[task];
            expect(configured?.modelId, task).toBeDefined();
            expect(configured?.providerId, task).toBeDefined();
            expect(resolveModelConfiguration(task, configuration), task).toEqual(configured);
        }
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

    it("uses the webpage-composition model for HTML puzzle families", () => {
        const configuration = {
            default: { modelId: "global-model", providerId: "provider" },
            puzzles: {
                default: { modelId: "puzzle-model" },
                "visual-composition": { modelId: "visual-model" },
                "webpage-composition": { modelId: "webpage-model" }
            }
        };

        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "html-comment" }, configuration))
            .toEqual({ modelId: "webpage-model", providerId: "provider" });
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "alt-text" }, configuration))
            .toEqual({ modelId: "webpage-model", providerId: "provider" });
        expect(resolveModelConfiguration({ kind: "puzzle", subtype: "visual-clue" }, configuration))
            .toEqual({ modelId: "visual-model", providerId: "provider" });
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
