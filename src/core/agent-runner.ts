import type { Agent } from "@earendil-works/pi-agent-core";

import { isRetryableModelError } from "./model.js";

export interface AgentPromptRetryOptions {
    maximumAttempts?: number;
    onRetry?: (attempt: number, error: Error) => void;
    preserveConversationOnRetry?: boolean;
    retryPrompt?: string;
}

/** Retry provider/runtime failures outside the agent; tool-contract recovery stays inside it. */
export async function promptAgentWithRecovery(
    agent: Pick<Agent, "prompt" | "reset" | "state">,
    prompt: string,
    options: AgentPromptRetryOptions = {}
): Promise<void> {
    const maximumAttempts = options.maximumAttempts ?? 3;
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
        throw new Error("Agent prompt maximumAttempts must be a positive integer.");
    }

    let currentPrompt = prompt;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        try {
            await agent.prompt(currentPrompt);
            if (agent.state.errorMessage !== undefined) throw new Error(agent.state.errorMessage);
            return;
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            if (!isRetryableModelError(normalized) || attempt === maximumAttempts) throw normalized;
            options.onRetry?.(attempt + 1, normalized);
            if (options.preserveConversationOnRetry) {
                currentPrompt = options.retryPrompt
                    ?? "The previous provider request failed before you could finish. Continue the current task from the existing conversation and staged tool state. Do not restart completed work.";
            } else {
                agent.reset();
                currentPrompt = prompt;
            }
        }
    }
}
