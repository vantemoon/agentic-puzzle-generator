export interface ProgressReporter {
    start(message: string): void;
    complete(message: string): void;
    fail(operation: string, error: unknown): void;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createProgressReporter(
    write: (message: string) => void = (message) => process.stderr.write(message)
): ProgressReporter {
    return {
        start(message) {
            write(`${message.replace(/[.]+$/u, "")}...\n`);
        },
        complete(message) {
            write(`${message.replace(/[.]+$/u, "")}.\n`);
        },
        fail(operation, error) {
            write(`${operation.replace(/[.:]+$/u, "")} failed: ${errorMessage(error)}\n`);
        }
    };
}

export function toolResultText(result: { content?: Array<{ type: string; text?: string }> }): string | undefined {
    const text = result.content
        ?.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
        .join("\n")
        .trim();
    return text === undefined || text.length === 0 ? undefined : text;
}

