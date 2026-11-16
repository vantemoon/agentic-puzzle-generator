import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    AGENT_RECOVERY_POLICY,
    Agent,
    withAgentRecoveryPolicy
} from "../src/core/recovering-agent.js";
import { promptAgentWithRecovery } from "../src/core/agent-runner.js";

async function agentFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return agentFiles(entryPath);
        return entry.name === "agent.ts" ? [entryPath] : [];
    }));
    return files.flat();
}

describe("shared agent error recovery", () => {
    it("adds the recovery policy once", () => {
        const first = withAgentRecoveryPolicy("Task prompt");
        const second = withAgentRecoveryPolicy(first);
        expect(first).toContain(AGENT_RECOVERY_POLICY);
        expect(second).toBe(first);
    });

    it("redirects a failed tool result back to the responsible agent", async () => {
        const agent = new Agent({
            initialState: { systemPrompt: "Task prompt" },
            streamFn: (() => {
                throw new Error("not used");
            }) as never
        });
        const result = await agent.afterToolCall?.({
            toolCall: { id: "call-1", name: "submit_result", arguments: {} },
            result: { content: [{ type: "text", text: "Field value is invalid." }] },
            isError: true
        } as never);

        expect(result?.isError).toBe(true);
        expect(result?.content).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "text",
                text: expect.stringContaining("submit_result failed on attempt 1 of 5")
            })
        ]));
        expect(agent.state.systemPrompt).toContain(AGENT_RECOVERY_POLICY);
    });

    it("routes every repository agent through the recovering wrapper", async () => {
        const files = await agentFiles(path.resolve("src/agents"));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const source = await readFile(file, "utf8");
            expect(source, file).toContain('from "../../core/recovering-agent.js"');
            expect(source, file).not.toContain('import { Agent } from "@earendil-works/pi-agent-core"');
        }
    });

    it("restarts an agent after transient provider failures", async () => {
        let attempts = 0;
        let resets = 0;
        const state: { errorMessage?: string } = {};
        const agent = {
            state,
            async prompt() {
                attempts += 1;
                state.errorMessage = attempts < 3 ? "Connection error" : undefined;
            },
            reset() {
                resets += 1;
                state.errorMessage = undefined;
            }
        };

        await promptAgentWithRecovery(agent as never, "Generate now.");
        expect(attempts).toBe(3);
        expect(resets).toBe(2);
    });

    it("preserves staged work when retrying a long-running agent", async () => {
        const prompts: string[] = [];
        let resets = 0;
        const state: { errorMessage?: string } = {};
        const agent = {
            state,
            async prompt(message: string) {
                prompts.push(message);
                state.errorMessage = prompts.length === 1 ? "Request timed out." : undefined;
            },
            reset() {
                resets += 1;
                state.errorMessage = undefined;
            }
        };

        await promptAgentWithRecovery(agent as never, "Build the bundle.", {
            preserveConversationOnRetry: true,
            retryPrompt: "Continue the staged bundle."
        });

        expect(prompts).toEqual(["Build the bundle.", "Continue the staged bundle."]);
        expect(resets).toBe(0);
    });
});
