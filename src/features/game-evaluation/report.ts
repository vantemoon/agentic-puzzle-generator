import type { GameEvaluation } from "./agent/agent.js";
import type { LevelEvidence } from "./evidence.js";

function markdownText(value: string): string {
    return value.replace(/\s+/g, " ").trim().replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[\\`*_\[\]]/g, "\\$&");
}

export function reportMarkdown(title: string, id: string, modelId: string, report: GameEvaluation, levels: LevelEvidence[]): string {
    const priorities = {
        "blocks-progress": "Blocks progress",
        "clarity-or-believability": "Clarity or believability",
        polish: "Polish"
    };
    const publicationStatuses = {
        plausible: "Plausible",
        unclear: "Unclear publication or access",
        inconsistent: "Inconsistent publication or access",
        "no-sensitive-material": "No sensitive material identified"
    };
    function renderCitations(evidence: GameEvaluation["handoffs"][number]["evidence"]): string[] {
        return evidence.map((source) =>
            `- Level ${source.level}, ${markdownText(source.path)} — ${markdownText(source.observation)}`);
    }
    const currentRoutes = {
        available: "A route is available",
        missing: "No route shown",
        unverified: "Route needs checking"
    };
    function renderFindings(findings: GameEvaluation["handoffs"]): string[] {
        if (findings.length === 0) return ["No findings reported.", ""];
        return findings.flatMap((item) => [
            `### ${markdownText(item.title)}`, "",
            `**${priorities[item.priority]}** · ${item.basis === "visible-evidence" ? "Visible evidence" : "Needs a live check"} · ${currentRoutes[item.currentRoute]}`, "",
            ...renderCitations(item.evidence),
            "", markdownText(item.impact), "", `**Suggested change** — ${markdownText(item.suggestion)}`, "",
            "**Solvability check for the proposal**", "",
            ...item.solvability.playerSteps.map((step, index) => `${index + 1}. ${markdownText(step)}`),
            "", `**Reasoning preserved** — ${markdownText(item.solvability.reasoning)}`,
            "", `**Live playtest** — ${markdownText(item.solvability.playtest)}`, ""
        ]);
    }

    return [
        `# ${markdownText(title)} — quality evaluation`, "",
        `Game ${markdownText(id)} · Model ${markdownText(modelId)}`, "",
        markdownText(report.overview), "",
        ...report.levels.flatMap(({ level, strengths, publication, findings }) => [
            `## Level ${level} — ${markdownText(levels[level - 1].title)}`, "",
            `**Strengths** — ${markdownText(strengths)}`, "",
            `**Publication and access** — ${publicationStatuses[publication.status]}`, "",
            `- **Visible access** — ${markdownText(publication.accessRoute)}`,
            `- **Publication basis** — ${markdownText(publication.publicationBasis)}`,
            "", markdownText(publication.assessment), "", ...renderCitations(publication.evidence), "",
            ...renderFindings(findings)
        ]),
        "## Campaign handoffs", "", ...renderFindings(report.handoffs),
        "## Review scope", "",
        "The evaluator inspected a static public snapshot. Live submissions, success responses, layout, and blind playthrough were outside this run.", "",
        ...levels.map((level, index) =>
            `- Level ${index + 1} — ${level.content.length} pages or text assets, ${level.images.length} raster images. `
            + (level.unrendered.length === 0
                ? "All listed media included."
                : `Media without visual or audio review: ${level.unrendered.map(markdownText).join(", ")}.`)),
        ""
    ].join("\n");
}

