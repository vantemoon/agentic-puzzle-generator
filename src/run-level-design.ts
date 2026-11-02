import { spawn } from "node:child_process";

import { resolveModelConfiguration } from "./core/model.js";

const requestFile = process.argv[2];
if (requestFile === undefined || process.argv.length !== 3) {
    process.stderr.write("Usage: npm run level:design -- <level-request.json>\n");
    process.exitCode = 1;
} else {
    const modelConfiguration = resolveModelConfiguration("level-design");
    const child = spawn("pi", [
        "--provider",
        modelConfiguration.providerId,
        "--model",
        modelConfiguration.modelId,
        "--extension",
        "./pi-extensions/level-design.ts"
    ], {
        stdio: "inherit",
        env: {
            ...process.env,
            LEVEL_DESIGN_REQUEST_FILE: requestFile
        }
    });

    child.on("error", (error) => {
        process.stderr.write(`Unable to start the level-design agent: ${error.message}\n`);
        process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
        if (signal !== null) {
            process.stderr.write(`Level-design agent stopped by signal ${signal}.\n`);
            process.exitCode = 1;
        } else {
            process.exitCode = code ?? 1;
        }
    });
}
