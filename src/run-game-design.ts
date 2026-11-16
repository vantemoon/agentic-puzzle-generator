import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createGameDesignAgent } from "./agents/game-design/agent.js";
import type { GameDesignSubmission } from "./agents/game-design/tool.js";
import { promptAgentWithRecovery } from "./core/agent-runner.js";
import { createProgressReporter, toolResultText } from "./core/progress.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";

const WORKER_ENVIRONMENT_KEY = "GAME_DESIGN_INTERNAL_WORKER";

type WorkerMessage =
    | { type: "model-ready" }
    | { type: "design-started" }
    | { type: "validation-started"; attempt: number }
    | { type: "complete"; levelCount: number }
    | { type: "validation-failed"; attempt: number; error?: string };

function sendWorkerMessage(message: WorkerMessage): void {
    process.send?.(message);
}

async function runGameDesignWorker(userBrief: string): Promise<void> {
    const progress = createProgressReporter();
    try {
        const agent = await createGameDesignAgent(repositoryPuzzleCatalog, userBrief);
        sendWorkerMessage({ type: "model-ready" });
        let submission: GameDesignSubmission | undefined;
        let lastSubmissionError: string | undefined;
        let validationAttempt = 0;
        agent.subscribe((event: AgentEvent) => {
            if (event.type === "tool_execution_start" && event.toolName === "submit_game_design") {
                validationAttempt += 1;
                sendWorkerMessage({ type: "validation-started", attempt: validationAttempt });
            }
            if (event.type === "tool_execution_end" && event.toolName === "submit_game_design" && !event.isError) {
                submission = event.result.details as GameDesignSubmission;
                sendWorkerMessage({ type: "complete", levelCount: submission.spec.levels.length });
            }
            if (event.type === "tool_execution_end" && event.toolName === "submit_game_design" && event.isError) {
                lastSubmissionError = toolResultText(event.result);
                sendWorkerMessage({
                    type: "validation-failed",
                    attempt: validationAttempt,
                    ...(lastSubmissionError === undefined ? {} : { error: lastSubmissionError })
                });
            }
        });
        sendWorkerMessage({ type: "design-started" });
        await promptAgentWithRecovery(agent,
            userBrief.length === 0
                ? "Invent and submit a complete multi-level investigation game now."
                : "Create and submit a complete multi-level investigation game from the supplied brief now.",
            {
                onRetry: (attempt, error) => progress.start(
                    `Retrying game-design model call (attempt ${attempt}): ${error.message}`
                )
            }
        );
        if (submission === undefined) {
            throw new Error(
                lastSubmissionError
                || agent.state.errorMessage
                || "The Game Design Agent did not submit a result."
            );
        }
        process.stdout.write(`${submission.files.specPath}\n`);
    } catch (error) {
        progress.fail("Game design", error);
        process.exitCode = 1;
    }
}

async function runResponsiveParent(userBrief: string): Promise<void> {
    const progress = createProgressReporter();

    progress.start(
        userBrief.length === 0
            ? "Preparing an autonomous game design"
            : "Preparing a game design from the supplied brief"
    );
    progress.start("Loading the game-design agent");

    const scriptPath = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [...process.execArgv, scriptPath, ...process.argv.slice(2)], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: { ...process.env, [WORKER_ENVIRONMENT_KEY]: "1" }
    });
    const configuredTimeout = Number(process.env.GAME_DESIGN_INIT_TIMEOUT_MS ?? 300_000);
    const initializationTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 300_000;
    let modelReady = false;
    const initializationTimeout = setTimeout(() => {
        if (modelReady) return;
        progress.fail(
            "Game-design agent initialization",
            `Initialization exceeded ${Math.round(initializationTimeoutMs / 1000)} seconds; check model credentials and provider availability or raise GAME_DESIGN_INIT_TIMEOUT_MS.`
        );
        child.kill("SIGTERM");
    }, initializationTimeoutMs);

    child.on("message", (value: unknown) => {
        const message = value as WorkerMessage;
        if (message.type === "model-ready") {
            modelReady = true;
            clearTimeout(initializationTimeout);
            progress.complete("Loaded the game-design agent");
        } else if (message.type === "design-started") {
            progress.start("Designing world canon, the campaign arc, and level objectives");
        } else if (message.type === "validation-started") {
            progress.start(`Validating game world and level requests (attempt ${message.attempt})`);
        } else if (message.type === "complete") {
            progress.complete(`Completed game design with ${message.levelCount} levels`);
        } else if (message.type === "validation-failed") {
            progress.fail(
                `Game-design validation attempt ${message.attempt}`,
                message.error ?? "The submission was rejected."
            );
            progress.start("Revising the rejected game design");
        }
    });

    try {
        const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => resolve({ code, signal }));
        });
        if (result.signal !== null) {
            progress.fail("Game-design worker", `Stopped by signal ${result.signal}.`);
            process.exitCode = 1;
        } else {
            process.exitCode = result.code ?? 1;
        }
    } catch (error) {
        progress.fail("Game-design worker startup", error);
        process.exitCode = 1;
    } finally {
        clearTimeout(initializationTimeout);
    }
}

const userBrief = process.argv.slice(2).join(" ").trim();
if (process.env[WORKER_ENVIRONMENT_KEY] === "1") {
    await runGameDesignWorker(userBrief);
} else {
    await runResponsiveParent(userBrief);
}

