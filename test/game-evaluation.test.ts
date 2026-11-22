import { describe, expect, it } from "vitest";

import { validateEvaluationReport, type GameEvaluation } from "../src/features/game-evaluation/agent/agent.js";
import { playerPageText, type LevelEvidence } from "../src/features/game-evaluation/evidence.js";

describe("game quality evaluation", () => {
    it("keeps public controls and link destinations while excluding private HTML and hidden fields", () => {
        const evidence = playerPageText(`
            <html><head><title>Archive</title><meta content="private metadata"></head><body>
                <!-- source-only clue -->
                <script>private script</script>
                <p hidden>hidden paragraph</p>
                <h1>Public archive</h1>
                <a href="/records/notes">Open notes</a>
                <form action="/api/search"><input type="hidden" name="target" value="/hidden-result">
                    <label>Record reference<input name="q" type="search"></label><button>Search</button>
                </form>
                <img src="/assets/notes.png" alt="Attached notes">
                <img src="data:image/svg+xml;utf8,%3Csvg%3E%3Ctext%3ECitation%3C%2Ftext%3E%3C%2Fsvg%3E">
            </body></html>
        `);
        expect(evidence).toContain("Open notes [link: /records/notes]");
        expect(evidence).toMatch(/\[form\]\s+Record reference/);
        expect(evidence).toContain("[media: /assets/notes.png, alt: Attached notes]");
        expect(evidence).toContain("embedded SVG text: Citation");
        expect(evidence).not.toMatch(/private|hidden|source-only|data:image/);
    });

    it("requires a review for every level and citations to its public evidence", () => {
        const levels: LevelEvidence[] = ["Archive", "Registry"].map((title) => ({
            title, paths: new Set(["/"]), content: [], images: [], unrendered: []
        }));
        const report: GameEvaluation = {
            overview: "A public-record investigation.",
            levels: [
                {
                    level: 1, strengths: "Clear archive entry.", findings: [],
                    publication: {
                        status: "unclear", accessRoute: "The public staff profile links to the notes.",
                        publicationBasis: "The briefing describes sharing with one person.", assessment: "The editor shared notes with one person, and the archive lists them under a public profile.",
                        evidence: [{ level: 1, path: "/", observation: "The briefing describes a limited handoff." }]
                    }
                },
                {
                    level: 2, strengths: "Specific permit request.", findings: [],
                    publication: {
                        status: "no-sensitive-material", accessRoute: "The registry home links to permit search.",
                        publicationBasis: "The permit registry publishes public filings.", assessment: "The registry lists public permits.",
                        evidence: [{ level: 2, path: "/", observation: "The registry describes its public records." }]
                    }
                }
            ],
            handoffs: []
        };
        expect(() => validateEvaluationReport(report, levels)).not.toThrow();
        expect(() => validateEvaluationReport({ ...report, levels: report.levels.slice(0, 1) }, levels))
            .toThrow("Include each level once");
        report.levels[0].publication.evidence[0].level = 2;
        expect(() => validateEvaluationReport(report, levels)).toThrow("Keep cross-level evidence in handoffs");
        report.levels[0].publication.evidence[0].level = 1;
        report.handoffs.push({
            title: "Unclear transition", priority: "clarity-or-believability", impact: "The next action is ambiguous.",
            basis: "needs-live-check",
            currentRoute: "unverified",
            suggestion: "Identify the record required by the registry.",
            solvability: {
                playerSteps: ["Get the permit number from the archive.", "Enter it in the permit registry."],
                reasoning: "The player still has to identify the correct permit in the archive.",
                playtest: "Start at the archive and confirm the permit number found there opens the matching registry record."
            },
            evidence: [
                { level: 1, path: "/", observation: "The opening names an archive." },
                { level: 2, path: "/not-a-public-page", observation: "The registry expects a permit number." }
            ]
        });
        expect(() => validateEvaluationReport(report, levels)).toThrow("unknown public path");
        const handoff = report.handoffs[0];
        handoff.evidence[1].path = "/";
        expect(() => validateEvaluationReport(report, levels)).not.toThrow();
        handoff.priority = "blocks-progress";
        expect(() => validateEvaluationReport(report, levels)).toThrow("can be a blocker only");
        handoff.basis = "visible-evidence";
        handoff.currentRoute = "available";
        expect(() => validateEvaluationReport(report, levels)).toThrow("can be a blocker only");
        handoff.currentRoute = "missing";
        expect(() => validateEvaluationReport(report, levels)).not.toThrow();
        handoff.solvability.playerSteps = [];
        expect(() => validateEvaluationReport(report, levels)).toThrow("requested report schema");
    });
});
