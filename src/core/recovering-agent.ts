import {
    Agent as CoreAgent,
    type AgentOptions
} from "@earendil-works/pi-agent-core";

export const AGENT_RECOVERY_POLICY = `
Shared error recovery policy:
1. A failed tool result is authoritative feedback, not permission to stop or claim success. Read the complete error and collect every reported issue before changing anything.
2. For schema, validation, contract, content, security, staging, or artifact errors, make the smallest targeted correction that resolves all reported issues. Preserve every valid input, exact value, ID, relationship, and previously accepted field.
3. Before retrying, compare the corrected payload with the error. Never repeat an identical rejected call. Recheck the complete contract so the repair does not introduce a new mismatch elsewhere.
4. Retry the responsible tool within the same run. Use no more than five total attempts, or the lower task-specific limit when one is stated. After each rejection, incorporate all current errors into the next repair.
5. If an error says required upstream information is missing or the contract is impossible, use the task's structured failure or revision result when available. Otherwise stop with the exact blocking error and the smallest upstream change required; do not invent data or silently change the contract.
6. Authentication, authorization, provider connection, rate-limit, unavailable-model, filesystem-permission, and process failures are infrastructure errors. Do not alter valid creative data to work around them or loop on an identical request. Surface the exact error for the outer runner to retry or escalate.
7. Report completion only after the required final tool call succeeds. Never treat a plausible draft, partial staged state, or rejected tool call as success.
`.trim();

export function withAgentRecoveryPolicy(systemPrompt: string): string {
    if (systemPrompt.includes(AGENT_RECOVERY_POLICY)) return systemPrompt;
    return `${systemPrompt.trim()}\n\n${AGENT_RECOVERY_POLICY}`.trim();
}

/** Every repository agent receives the same tool-error repair contract. */
export class Agent extends CoreAgent {
    constructor(options: AgentOptions) {
        const initialState = options.initialState ?? {};
        const failureCounts = new Map<string, number>();
        const suppliedAfterToolCall = options.afterToolCall;
        const afterToolCall: AgentOptions["afterToolCall"] = async (context, signal) => {
            const supplied = await suppliedAfterToolCall?.(context, signal);
            if (!context.isError) {
                failureCounts.delete(context.toolCall.name);
                return supplied;
            }

            const attempt = (failureCounts.get(context.toolCall.name) ?? 0) + 1;
            failureCounts.set(context.toolCall.name, attempt);
            const maximum = 5;
            const originalContent = supplied?.content ?? context.result.content;
            const instruction = attempt < maximum
                ? `Recovery directive: ${context.toolCall.name} failed on attempt ${attempt} of ${maximum}. Read every error above, preserve valid contract data, make a non-identical targeted repair, recheck the full contract, and retry this tool.`
                : `Recovery directive: ${context.toolCall.name} failed on attempt ${attempt} of ${maximum}. The recovery limit is exhausted. Do not call this tool again or claim success; surface the exact blocking error to the outer runner.`;
            return {
                ...supplied,
                content: [...originalContent, { type: "text", text: instruction }],
                isError: true,
                ...(attempt >= maximum ? { terminate: true } : {})
            };
        };
        super({
            ...options,
            afterToolCall,
            initialState: {
                ...initialState,
                systemPrompt: withAgentRecoveryPolicy(initialState.systemPrompt ?? "")
            }
        });
    }
}
