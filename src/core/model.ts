import type { ModelRuntime as ModelRuntimeType } from "@earendil-works/pi-coding-agent";

const DEFAULT_PROVIDER_ID = "kadi-openai";
const DEFAULT_MODEL_ID = "openai/gpt-5.6-sol";
const KADI_PROVIDER_IDS = [DEFAULT_PROVIDER_ID, "kadi"] as const;

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

export async function loadKadiModel() {
    const modelRuntime = await createModelRuntime();

    const modelId = process.env.KADI_MODEL_ID || DEFAULT_MODEL_ID;
    const requestedProviderId = process.env.KADI_PROVIDER_ID;
    const providerIds = requestedProviderId === undefined
        ? KADI_PROVIDER_IDS
        : [requestedProviderId];
    const providerId = providerIds.find((candidate) => modelRuntime.getModel(candidate, modelId) !== undefined);
    const model = providerId === undefined ? undefined : modelRuntime.getModel(providerId, modelId);

    if (providerId === undefined || model === undefined) {
        throw new Error(`Model not found: ${providerIds.map((candidate) => `${candidate}/${modelId}`).join(" or ")}`);
    }

    const auth = await modelRuntime.getAuth(providerId);

    if (!auth) {
        throw new Error(`Auth not found for provider: ${providerId}`);
    }

    return { modelRuntime, model };
}
