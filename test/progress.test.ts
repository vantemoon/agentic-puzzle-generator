import { describe, expect, it } from "vitest";

import { createProgressReporter, toolResultText } from "../src/core/progress.js";

describe("agent progress reporting", () => {
    it("formats event-driven progress and failures consistently", () => {
        const output: string[] = [];
        const progress = createProgressReporter((message) => output.push(message));

        progress.start("Loading the agent");
        progress.complete("Completed generation.");
        progress.fail("Generation", new Error("invalid submission"));

        expect(output).toEqual([
            "Loading the agent...\n",
            "Completed generation.\n",
            "Generation failed: invalid submission\n"
        ]);
    });

    it("extracts text from failed tool results", () => {
        expect(toolResultText({
            content: [
                { type: "image" },
                { type: "text", text: "first issue" },
                { type: "text", text: "second issue" }
            ]
        })).toBe("first issue\nsecond issue");
    });
});

