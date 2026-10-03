import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "kadi";
const DEFAULT_MODEL_ID = "moonshot/kimi-k2.6";

export async function loadKadiModel() {
    const modelRuntime = await ModelRuntime.create();

    const modelId = process.env.KADI_MODEL_ID || DEFAULT_MODEL_ID;
    const model = modelRuntime.getModel(PROVIDER_ID, modelId);

    if (!model) {
        throw new Error(`Model not found: ${PROVIDER_ID}/${modelId}`);
    }

    const auth = await modelRuntime.getAuth(PROVIDER_ID);

    if (!auth) {
        throw new Error(`Auth not found for provider: ${PROVIDER_ID}`);
    }

    return { modelRuntime, model };
}