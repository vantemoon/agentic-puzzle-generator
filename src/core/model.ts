import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ModelRuntime as ModelRuntimeType } from "@earendil-works/pi-coding-agent";
import { authoredContentForPuzzle } from "./authored-content.js";

export type ModelTask =
    | "level-design"
    | "level-review"
    | "level-bundle"
    | { kind: "puzzle"; subtype: string };

export interface ModelSelection {
    modelId?: string;
    providerId?: string;
}

export interface ModelConfigurationFile {
    default: Required<ModelSelection>;
    tasks?: Partial<Record<Extract<ModelTask, string>, ModelSelection>>;
    puzzles?: Record<string, ModelSelection | undefined> & { default?: ModelSelection };
}

function assertKnownKeys(value: Record<string, unknown>, keys: string[], context: string): void {
    const unknown = Object.keys(value).filter((key) => !keys.includes(key));
    if (unknown.length > 0) throw new Error(`${context} has unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
}

function parseSelection(value: unknown, context: string): ModelSelection {
    if (!isRecord(value)) throw new Error(`${context} must be an object.`);
    assertKnownKeys(value, ["modelId", "providerId"], context);
    const modelId = value.modelId;
    const providerId = value.providerId;
    if (modelId !== undefined && (typeof modelId !== "string" || modelId.length === 0)) {
        throw new Error(`${context}.modelId must be a non-empty string.`);
    }
    if (providerId !== undefined && (typeof providerId !== "string" || providerId.length === 0)) {
        throw new Error(`${context}.providerId must be a non-empty string.`);
    }
    if (modelId === undefined && providerId === undefined) {
        throw new Error(`${context} must specify modelId, providerId, or both.`);
    }
    return { modelId, providerId };
}

export function parseModelConfigurationFile(value: unknown): ModelConfigurationFile {
    if (!isRecord(value)) throw new Error("LLM model configuration must be a JSON object.");
    assertKnownKeys(value, ["default", "tasks", "puzzles"], "LLM model configuration");
    if (value.default === undefined) throw new Error("LLM model configuration must specify default.");
    const defaultSelection = parseSelection(value.default, "default");
    if (defaultSelection.modelId === undefined) throw new Error("default.modelId is required.");
    if (defaultSelection.providerId === undefined) throw new Error("default.providerId is required.");
    const configuration: ModelConfigurationFile = {
        default: {
            modelId: defaultSelection.modelId,
            providerId: defaultSelection.providerId,
        },
    };
    if (value.tasks !== undefined) {
        if (!isRecord(value.tasks)) throw new Error("tasks must be an object.");
        assertKnownKeys(value.tasks, ["level-design", "level-review", "level-bundle"], "tasks");
        configuration.tasks = Object.fromEntries(
            Object.entries(value.tasks).map(([name, selection]) => [name, parseSelection(selection, `tasks.${name}`)])
        );
    }
    if (value.puzzles !== undefined) {
        if (!isRecord(value.puzzles)) throw new Error("puzzles must be an object.");
        configuration.puzzles = Object.fromEntries(
            Object.entries(value.puzzles).map(([name, selection]) => [name, parseSelection(selection, `puzzles.${name}`)])
        );
    }
    return configuration;
}

export function loadModelConfigurationFile(workingDirectory = process.cwd()): ModelConfigurationFile {
    const filePath = path.resolve(workingDirectory, "llm-models.json");
    if (!existsSync(filePath)) {
        throw new Error(`LLM model configuration not found: ${filePath}`);
    }
    let value: unknown;
    try {
        value = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
        throw new Error(`Unable to read LLM model configuration ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseModelConfigurationFile(value);
}

export function resolveModelConfiguration(
    task?: ModelTask,
    configuration: ModelConfigurationFile = loadModelConfigurationFile()
): Required<ModelSelection> {
    const taskSelections = task === undefined
        ? []
        : typeof task === "string"
            ? [configuration.tasks?.[task]]
            : [
                configuration.puzzles?.[task.subtype],
                configuration.puzzles?.[authoredContentForPuzzle(task.subtype)?.mode ?? ""],
                configuration.puzzles?.default
            ];
    return {
        modelId: taskSelections.find((selection) => selection?.modelId !== undefined)?.modelId
            ?? configuration.default.modelId,
        providerId: taskSelections.find((selection) => selection?.providerId !== undefined)?.providerId
            ?? configuration.default.providerId,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasObjectVariants(schema: Record<string, unknown>, keyword: "anyOf" | "oneOf"): boolean {
    const variants = schema[keyword];
    return Array.isArray(variants)
        && variants.length > 0
        && variants.every((variant) => isRecord(variant) && variant.type === "object");
}

/**
 * Kadi's OpenAI-compatible endpoint requires every function parameter schema
 * to declare an object at its root. TypeBox represents unions as a root-level
 * `anyOf`, so add the otherwise-implied object type without changing either
 * branch of the schema.
 */
export function normalizeKadiToolSchemas(payload: unknown): unknown {
    if (!isRecord(payload) || !Array.isArray(payload.tools)) {
        return payload;
    }

    let changed = false;
    const tools = payload.tools.map((tool) => {
        if (!isRecord(tool) || !isRecord(tool.function) || !isRecord(tool.function.parameters)) {
            return tool;
        }

        const parameters = tool.function.parameters;
        if (parameters.type !== undefined
            || (!hasObjectVariants(parameters, "anyOf") && !hasObjectVariants(parameters, "oneOf"))) {
            return tool;
        }

        changed = true;
        return {
            ...tool,
            function: {
                ...tool.function,
                parameters: { ...parameters, type: "object" },
            },
        };
    });

    return changed ? { ...payload, tools } : payload;
}

function configureKadiCompatibility(modelRuntime: ModelRuntimeType): void {
    const streamSimple = modelRuntime.streamSimple.bind(modelRuntime);

    modelRuntime.streamSimple = ((model, context, options) => {
        const callerOnPayload = options?.onPayload;
        return streamSimple(model, context, {
            ...options,
            onPayload: async (payload, payloadModel) => {
                const callerPayload = await callerOnPayload?.(payload, payloadModel);
                return normalizeKadiToolSchemas(callerPayload === undefined ? payload : callerPayload);
            },
        });
    }) as ModelRuntimeType["streamSimple"];
}

async function createModelRuntime(): Promise<ModelRuntimeType> {
    const packageEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
    const runtimeModuleUrl = new URL("./core/model-runtime.js", packageEntry).href;
    const { ModelRuntime } = await import(runtimeModuleUrl) as {
        ModelRuntime: typeof ModelRuntimeType;
    };
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    configureKadiCompatibility(modelRuntime);
    return modelRuntime;
}

export async function loadKadiModel(task?: ModelTask) {
    const modelRuntime = await createModelRuntime();

    const { modelId, providerId } = resolveModelConfiguration(task);
    const model = modelRuntime.getModel(providerId, modelId);

    if (model === undefined) {
        throw new Error(`Model not found: ${providerId}/${modelId}`);
    }

    const auth = await modelRuntime.getAuth(providerId);

    if (!auth) {
        throw new Error(`Auth not found for provider: ${providerId}`);
    }

    return { modelRuntime, model };
}
