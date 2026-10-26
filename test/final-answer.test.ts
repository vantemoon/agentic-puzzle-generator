import { describe, expect, it } from "vitest";

import { evaluateExactAnswer } from "../src/levels/final-answer.js";

describe("exact answer evaluation", () => {
    it("trims only outer whitespace for strings", () => {
        const verification = {
            prompt: "Enter the password exactly.",
            dataType: "string" as const,
            expectedValue: "EMBER-0420"
        };
        expect(evaluateExactAnswer("  EMBER-0420  ", verification).accepted).toBe(true);
        expect(evaluateExactAnswer("ember-0420", verification).accepted).toBe(false);
        expect(evaluateExactAnswer("EMBER 0420", verification).accepted).toBe(false);
    });

    it("uses numeric equality for numbers", () => {
        const verification = {
            prompt: "Enter the code using digits.",
            dataType: "number" as const,
            expectedValue: 420
        };
        expect(evaluateExactAnswer("0420", verification).accepted).toBe(true);
        expect(evaluateExactAnswer(420, verification).accepted).toBe(true);
        expect(evaluateExactAnswer("421", verification).accepted).toBe(false);
    });
});
