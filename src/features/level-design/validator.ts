import { graphShape } from "../../shared/utilities/graph.js";
import { isDeepStrictEqual } from "node:util";

import Value from "typebox/value";

import { duplicateValues, isCalendarDate } from "../../shared/utilities/validation.js";
import { assertPuzzleAcceptsAnswer } from "../puzzle-generation/puzzle-contract.js";
import { getTerminalAction } from "./action-catalog.js";
import { assertPuzzleCatalog, getPuzzleCatalogEntry, type PuzzleCatalog } from "../puzzle-generation/catalog.js";
import {
    applyTransformation,
    getTransformation,
    transformationDifficultyRank
} from "./transformation-catalog.js";
import { LEVEL_SCHEMA_VERSION, LevelBlueprintSchema, LevelDesignRequestSchema, type LevelBlueprint, type LevelDesignRequest, type PuzzleOutput, type ScalarDataType } from "./types.js";

interface ResolvedValue {
    dataType: ScalarDataType;
    value: string | number;
}

function validateWorldReferenceShape(reference: LevelDesignRequest["world"]): string[] {
    const errors: string[] = [];
    for (const duplicate of duplicateValues(reference.entityIds)) {
        errors.push(`Duplicate referenced world-entity ID: ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(reference.factIds)) {
        errors.push(`Duplicate referenced world-fact ID: ${duplicate}.`);
    }
    if (reference.asOf !== undefined && !isCalendarDate(reference.asOf)) {
        errors.push(`World reference has invalid asOf date ${reference.asOf}.`);
    }
    return errors;
}

function fictionalHostname(value: string): string | undefined {
    const trimmed = value.trim();
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(trimmed)
            ? `https://${trimmed}`
            : undefined;
    if (candidate === undefined) return undefined;
    try {
        return new URL(candidate).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

export function validateLevelDesignRequest(value: unknown): string[] {
    if (!Value.Check(LevelDesignRequestSchema, value)) {
        return ["Level-design request does not satisfy the canonical schema."];
    }
    const request = value as LevelDesignRequest;
    const errors = validateWorldReferenceShape(request.world);
    for (const id of duplicateValues(request.requiredDiscoveries.map((item) => item.id))) {
        errors.push(`Duplicate required discovery ID: ${id}.`);
    }
    for (const id of duplicateValues(request.terminalAction.requiredOutputs.map((item) => item.id))) {
        errors.push(`Duplicate terminal output ID: ${id}.`);
    }
    for (const input of request.startingInputs) {
        if (!("dataType" in input) || input.dataType !== "string") continue;
        const hostname = fictionalHostname(input.value);
        if (hostname?.split(".").includes("example")) {
            errors.push(
                `Starting input ${input.id} uses placeholder hostname ${hostname}; `
                + "use a site-specific .test hostname until deployment."
            );
        }
    }
    return errors;
}

export function assertLevelDesignRequest(value: unknown): asserts value is LevelDesignRequest {
    const errors = validateLevelDesignRequest(value);
    if (errors.length > 0) throw new Error(`Invalid level-design request:\n- ${errors.join("\n- ")}`);
}

function outputValue(level: LevelBlueprint, puzzleId: string, output: PuzzleOutput): ResolvedValue {
    if (output.from === "revealed") return { dataType: output.dataType, value: output.value };
    const puzzle = level.puzzles.find((candidate) => candidate.id === puzzleId);
    if (puzzle === undefined) throw new Error(`Missing puzzle ${puzzleId}.`);
    return {
        dataType: puzzle.design.verification.dataType,
        value: puzzle.design.verification.expectedValue
    };
}

export function resolvePuzzleOutput(
    level: LevelBlueprint,
    puzzleId: string,
    outputId: string
): ResolvedValue | undefined {
    const puzzle = level.puzzles.find((candidate) => candidate.id === puzzleId);
    const output = puzzle?.design.outputs.find((candidate) => candidate.id === outputId);
    return output === undefined ? undefined : outputValue(level, puzzleId, output);
}

export function validateLevelBlueprint(value: unknown, catalog: PuzzleCatalog): string[] {
    assertPuzzleCatalog(catalog);
    if (!Value.Check(LevelBlueprintSchema, value)) {
        const schemaErrors = [...Value.Errors(LevelBlueprintSchema, value)].slice(0, 12);
        return schemaErrors.map((error) => {
            const details = error as unknown as { path?: string; instancePath?: string; message?: string };
            const errorPath = details.path ?? details.instancePath ?? "/";
            return `Level schema error at ${errorPath.length === 0 ? "/" : errorPath}: ${details.message ?? "invalid value"}`;
        });
    }
    const level = value as LevelBlueprint;
    const errors: string[] = [];

    if (level.schemaVersion !== LEVEL_SCHEMA_VERSION) {
        errors.push(`Unsupported schema version ${level.schemaVersion}; expected ${LEVEL_SCHEMA_VERSION}.`);
    }
    errors.push(...validateWorldReferenceShape(level.world));
    if (level.catalogVersion !== catalog.version) errors.push(`Level catalog version ${level.catalogVersion} does not match ${catalog.version}.`);

    const structure = level.generationConfig.structuralDifficulty;
    if (structure.puzzleCount.minimum > structure.puzzleCount.maximum) errors.push("Puzzle-count minimum must not exceed its maximum.");
    if (structure.phaseCount.minimum > structure.phaseCount.maximum) errors.push("Phase-count minimum must not exceed its maximum.");
    if (level.puzzles.length < structure.puzzleCount.minimum || level.puzzles.length > structure.puzzleCount.maximum) {
        errors.push(`Puzzle count ${level.puzzles.length} is outside ${structure.puzzleCount.minimum}-${structure.puzzleCount.maximum}.`);
    }
    if (level.phases.length < structure.phaseCount.minimum || level.phases.length > structure.phaseCount.maximum) {
        errors.push(`Phase count ${level.phases.length} is outside ${structure.phaseCount.minimum}-${structure.phaseCount.maximum}.`);
    }

    const phaseIds = level.phases.map((phase) => phase.id);
    const phaseOrders = level.phases.map((phase) => String(phase.order));
    const puzzleIds = level.puzzles.map((puzzle) => puzzle.id);
    const startingInputIds = level.startingInputs.map((input) => input.id);
    const externalRequirementIds = level.externalContentRequirements.map((requirement) => requirement.id);
    const requiredResourceIds = level.requiredResources.map((resource) => resource.id);
    for (const duplicate of duplicateValues(phaseIds)) errors.push(`Duplicate phase ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(phaseOrders)) errors.push(`Duplicate phase order: ${duplicate}.`);
    for (const duplicate of duplicateValues(puzzleIds)) errors.push(`Duplicate puzzle ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(startingInputIds)) errors.push(`Duplicate starting-input ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(externalRequirementIds)) errors.push(`Duplicate external-content requirement ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(requiredResourceIds)) errors.push(`Duplicate required-resource ID: ${duplicate}.`);

    const phaseMap = new Map(level.phases.map((phase) => [phase.id, phase]));
    const puzzleMap = new Map(level.puzzles.map((puzzle) => [puzzle.id, puzzle]));
    const startingInputMap = new Map(level.startingInputs.map((input) => [input.id, input]));
    const externalRequirementIdSet = new Set(externalRequirementIds);
    const usedExternalRequirementIds = new Set<string>();
    const edges: Array<{ from: string; to: string }> = [];
    const consumedStartingInputs = new Set<string>();
    let transformationCount = 0;

    for (const puzzle of level.puzzles) {
        const phase = phaseMap.get(puzzle.phaseId);
        if (phase === undefined) errors.push(`Puzzle ${puzzle.id} references missing phase ${puzzle.phaseId}.`);

        const design = puzzle.design;
        const entry = getPuzzleCatalogEntry(catalog, design.subtype);
        if (entry === undefined) {
            errors.push(`Puzzle ${puzzle.id} uses unknown subtype ${design.subtype}.`);
        } else {
            if (entry.puzzleType !== design.puzzleType) errors.push(`Puzzle ${puzzle.id} uses type ${design.puzzleType}, but subtype ${design.subtype} belongs to ${entry.puzzleType}.`);
            if (!Value.Check(entry.generationSpecSchema, design.generationSpec)) {
                errors.push(`Puzzle ${puzzle.id} has an invalid generationSpec for ${design.subtype}.`);
            } else {
                const specIssues = entry.validateGenerationSpec?.(design.generationSpec) ?? [];
                errors.push(...specIssues.map((issue) => `Puzzle ${puzzle.id} ${issue}`));
                if (entry.compileGenerationSpec !== undefined && specIssues.length === 0) {
                    try {
                        const compiled = entry.compileGenerationSpec(design.generationSpec);
                        assertPuzzleAcceptsAnswer(compiled, design.verification.expectedValue);
                    } catch (error) {
                        errors.push(`Puzzle ${puzzle.id} ${design.subtype} generationSpec failed: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }
        if (design.generationSpec.id !== puzzle.id) errors.push(`Puzzle ${puzzle.id} generationSpec must preserve the same ID.`);
        if (!isDeepStrictEqual(design.generationSpec.intendedSolution, design.verification.expectedValue)) {
            errors.push(`Puzzle ${puzzle.id} verification answer must match generationSpec.intendedSolution.`);
        }

        for (const duplicate of duplicateValues(design.inputs.map((input) => input.id))) errors.push(`Puzzle ${puzzle.id} has duplicate input ${duplicate}.`);
        for (const duplicate of duplicateValues(design.outputs.map((output) => output.id))) errors.push(`Puzzle ${puzzle.id} has duplicate output ${duplicate}.`);
        const puzzleExternalRequirementIds = design.externalContentRequirementIds ?? [];
        for (const duplicate of duplicateValues(puzzleExternalRequirementIds)) {
            errors.push(`Puzzle ${puzzle.id} has duplicate external-content requirement ${duplicate}.`);
        }
        for (const requirementId of puzzleExternalRequirementIds) {
            if (!externalRequirementIdSet.has(requirementId)) {
                errors.push(`Puzzle ${puzzle.id} references missing external-content requirement ${requirementId}.`);
            } else {
                usedExternalRequirementIds.add(requirementId);
            }
        }
        const hasRevealedOutput = design.outputs.some((output) => output.from === "revealed");
        if (hasRevealedOutput && design.revealContext === undefined) errors.push(`Puzzle ${puzzle.id} must explain how its separately revealed outputs become available.`);
        if (!hasRevealedOutput && design.revealContext !== undefined) errors.push(`Puzzle ${puzzle.id} has revealContext but no separately revealed outputs.`);

        if (design.inputs.filter((input) => input.access !== undefined).length > 1) {
            errors.push(`Puzzle ${puzzle.id} can declare access on at most one input.`);
        }
        for (const input of design.inputs) {
            let sourceValue: ResolvedValue | undefined;
            if (input.source.kind === "starting-input") {
                const source = startingInputMap.get(input.source.inputId);
                if (source === undefined) errors.push(`Puzzle ${puzzle.id} input ${input.id} references missing starting input ${input.source.inputId}.`);
                else {
                    if ("dataType" in source) {
                        sourceValue = { dataType: source.dataType, value: source.value };
                    }
                    consumedStartingInputs.add(source.id);
                    if (input.expectedSemanticRoles !== undefined
                        && !input.expectedSemanticRoles.includes(source.semanticRole)) {
                        errors.push(
                            `Puzzle ${puzzle.id} input ${input.id} expects one of roles ${input.expectedSemanticRoles.join(", ")}, `
                            + `but starting input ${source.id} has role ${source.semanticRole}.`
                        );
                    }
                }
            } else {
                const sourcePuzzleId = input.source.puzzleId;
                const sourceOutputId = input.source.outputId;
                if (sourcePuzzleId === puzzle.id) errors.push(`Puzzle ${puzzle.id} input ${input.id} cannot depend on itself.`);
                sourceValue = resolvePuzzleOutput(level, sourcePuzzleId, sourceOutputId);
                if (sourceValue === undefined) {
                    errors.push(`Puzzle ${puzzle.id} input ${input.id} references missing output ${sourcePuzzleId}.${sourceOutputId}.`);
                } else {
                    const sourcePuzzle = puzzleMap.get(sourcePuzzleId);
                    const sourceOutput = sourcePuzzle?.design.outputs.find((output) => output.id === sourceOutputId);
                    edges.push({ from: sourcePuzzleId, to: puzzle.id });
                    const sourcePhase = phaseMap.get(sourcePuzzle?.phaseId ?? "");
                    if (sourcePhase !== undefined && phase !== undefined && sourcePhase.order > phase.order) {
                        errors.push(`Puzzle ${puzzle.id} depends on later phase ${sourcePhase.id}.`);
                    }
                    if (input.expectedSemanticRoles !== undefined && sourceOutput !== undefined) {
                        if (!input.expectedSemanticRoles.includes(sourceOutput.semanticRole)) {
                            errors.push(
                                `Puzzle ${puzzle.id} input ${input.id} expects one of roles ${input.expectedSemanticRoles.join(", ")}, but ${sourcePuzzleId}.${sourceOutputId} has role ${sourceOutput.semanticRole}.`
                            );
                        }
                    }
                }
            }

            if (input.access?.kind === "lookup"
                && (sourceValue === undefined || String(sourceValue.value).trim().length === 0 || input.transform !== undefined)) {
                errors.push(`Lookup access on ${puzzle.id}.${input.id} needs an exact visible value from a starting input or earlier puzzle output, without a transform.`);
            }

            if (input.transform !== undefined) {
                transformationCount += 1;
                if (input.source.kind === "starting-input") {
                    const source = startingInputMap.get(input.source.inputId);
                    if (source !== undefined && !("dataType" in source)) {
                        errors.push(`Puzzle ${puzzle.id} input ${input.id} cannot transform bundle-entry starting input ${source.id}.`);
                    }
                }
                const transform = getTransformation(input.transform.type);
                if (!level.generationConfig.transformationPolicy.enabled) errors.push(`Puzzle ${puzzle.id} uses a transformation while transformations are disabled.`);
                if (transform === undefined) {
                    errors.push(`Puzzle ${puzzle.id} input ${input.id} uses unknown transformation ${input.transform.type}.`);
                } else if (sourceValue !== undefined) {
                    if (sourceValue.dataType !== transform.inputType) errors.push(`Transformation ${input.transform.type} cannot consume ${sourceValue.dataType} input ${puzzle.id}.${input.id}.`);
                    if (transformationDifficultyRank(transform.difficulty) > transformationDifficultyRank(level.generationConfig.transformationPolicy.maxDifficulty)) {
                        errors.push(`Transformation ${input.transform.type} exceeds the configured maximum difficulty.`);
                    }
                    try {
                        const transformed = applyTransformation(input.transform.type, sourceValue.value, input.transform.config);
                        if (isDeepStrictEqual(transformed, sourceValue.value)) errors.push(`Transformation ${input.transform.type} on ${puzzle.id}.${input.id} does not change the source value; omit it.`);
                    } catch (error) {
                        errors.push(`Transformation ${input.transform.type} on ${puzzle.id}.${input.id} is invalid: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }
    }

    if (transformationCount > level.generationConfig.transformationPolicy.maxCount) {
        errors.push(`Transformation count ${transformationCount} exceeds configured maximum ${level.generationConfig.transformationPolicy.maxCount}.`);
    }
    for (const input of level.startingInputs) {
        if (!consumedStartingInputs.has(input.id)) {
            errors.push(
                `Starting input ${input.id} is not consumed by any puzzle. `
                + "Because starting inputs are request-owned, reference it from a puzzle input and make it materially constrain that puzzle."
            );
        }
    }
    for (const requirementId of externalRequirementIds) {
        if (!usedExternalRequirementIds.has(requirementId)) {
            errors.push(`External-content requirement ${requirementId} is not used by any puzzle.`);
        }
    }

    const answerGroups = new Map<string, typeof level.puzzles>();
    for (const puzzle of level.puzzles) {
        const key = `${puzzle.design.verification.dataType}:${JSON.stringify(puzzle.design.verification.expectedValue)}`;
        answerGroups.set(key, [...(answerGroups.get(key) ?? []), puzzle]);
    }
    for (const group of answerGroups.values()) {
        if (group.length > 1 && group.some((puzzle) => puzzle.design.duplicateAnswerJustification === undefined)) {
            errors.push(`Duplicate verification answer is used by ${group.map((puzzle) => puzzle.id).join(", ")} without explicit justification.`);
        }
    }

    const action = getTerminalAction(level.terminalAction.actionType);
    if (action === undefined) {
        errors.push(`Unknown terminal action type ${level.terminalAction.actionType}.`);
    } else {
        if (level.terminalAction.interaction !== action.interaction) errors.push(`Terminal action ${action.id} must use ${action.interaction}.`);
        if (level.terminalAction.fields.length < action.minimumFields || level.terminalAction.fields.length > action.maximumFields) {
            errors.push(`Terminal action ${action.id} requires ${action.minimumFields}-${action.maximumFields} fields.`);
        }
        const roles = level.terminalAction.fields.map((field) => field.semanticRole);
        for (const role of action.requiredSemanticRoles) if (!roles.includes(role)) errors.push(`Terminal action ${action.id} is missing required semantic role ${role}.`);
        for (const role of roles) if (!action.supportedSemanticRoles.includes(role)) errors.push(`Terminal action ${action.id} does not support semantic role ${role}.`);
    }

    for (const duplicate of duplicateValues(level.terminalAction.fields.map((field) => field.id))) errors.push(`Duplicate terminal field ID: ${duplicate}.`);
    const terminalSources = level.terminalAction.fields.map((field) => `${field.source.puzzleId}.${field.source.outputId}`);
    for (const duplicate of duplicateValues(terminalSources)) errors.push(`Terminal fields cannot reuse source output ${duplicate}.`);
    for (const field of level.terminalAction.fields) {
        if (resolvePuzzleOutput(level, field.source.puzzleId, field.source.outputId) === undefined) {
            errors.push(`Terminal field ${field.id} references missing output ${field.source.puzzleId}.${field.source.outputId}.`);
        }
    }

    const graph = graphShape(puzzleIds, edges);
    if (graph.hasCycle) errors.push("Puzzle data flow must form a directed acyclic graph.");
    if (graph.maxWidth > structure.maxParallelPuzzles) errors.push(`Graph width ${graph.maxWidth} exceeds configured maximum parallel puzzles ${structure.maxParallelPuzzles}.`);

    if (level.environment.mode === "self-contained" && level.externalContentRequirements.length > 0) {
        errors.push("Self-contained levels cannot require knowledge from outside the game.");
    }

    return errors;
}

export function validateLevelAgainstRequest(level: LevelBlueprint, request: LevelDesignRequest, catalog: PuzzleCatalog): string[] {
    const errors = validateLevelBlueprint(level, catalog);
    if (level.id !== request.levelId) errors.push(`Level ID must remain ${request.levelId}.`);
    if (level.investigationQuestion !== request.investigationQuestion) {
        errors.push("The investigation question must match the game-design request.");
    }
    if (!isDeepStrictEqual(level.world, request.world)) {
        errors.push("Level world reference must match the game-design request.");
    }
    if (level.catalogVersion !== request.catalogVersion) errors.push("Level must use the requested puzzle catalog version.");
    if (level.genre !== request.genre) errors.push(`Level genre must remain ${request.genre}.`);
    if (!isDeepStrictEqual(level.environment, request.environment)) errors.push("Level environment must match the game-design request.");
    if (!isDeepStrictEqual(level.startingInputs, request.startingInputs)) errors.push("Level starting inputs must match the game-design request.");
    if (!isDeepStrictEqual(level.externalContentRequirements, request.externalContentRequirements)) {
        errors.push("Level external-content requirements must match the game-design request.");
    }
    if (level.terminalAction.actionType !== request.terminalAction.actionType) errors.push("Terminal action type must match the game-design request.");
    if (level.terminalAction.description !== request.terminalAction.description) errors.push("Terminal action description must match the game-design request.");
    if (!isDeepStrictEqual(level.terminalAction.briefing, request.terminalAction.briefing)) {
        errors.push("Terminal action briefing must match the game-design request.");
    }

    if (level.terminalAction.fields.length !== request.terminalAction.requiredOutputs.length) {
        errors.push("Terminal field count must match the game-design request.");
    }
    for (const required of request.terminalAction.requiredOutputs) {
        const field = level.terminalAction.fields.find((candidate) => candidate.id === required.id);
        if (field === undefined) {
            errors.push(`Missing terminal field ${required.id}.`);
            continue;
        }
        if (field.semanticRole !== required.semanticRole) errors.push(`Terminal field ${required.id} must use semantic role ${required.semanticRole}.`);
        const resolved = resolvePuzzleOutput(level, field.source.puzzleId, field.source.outputId);
        if (resolved !== undefined && resolved.dataType !== required.dataType) errors.push(`Terminal field ${required.id} must have type ${required.dataType}.`);
        if (required.requiredValue !== undefined && resolved !== undefined && !isDeepStrictEqual(resolved.value, required.requiredValue)) {
            errors.push(`Terminal field ${required.id} must resolve to its game-defined value.`);
        }
    }

    const discoveryBindings = level.puzzles.flatMap((puzzle) => puzzle.design.outputs.map((output) => ({ puzzle, output })))
        .filter(({ output }) => output.requiredDiscoveryId !== undefined);
    for (const required of request.requiredDiscoveries) {
        const matches = discoveryBindings.filter(({ output }) => output.requiredDiscoveryId === required.id);
        if (matches.length !== 1) {
            errors.push(`Required discovery ${required.id} must be produced exactly once.`);
            continue;
        }
        const resolved = outputValue(level, matches[0].puzzle.id, matches[0].output);
        if (resolved.dataType !== required.dataType || !isDeepStrictEqual(resolved.value, required.value)) {
            errors.push(
                `Required discovery ${required.id} expected ${required.dataType} ${JSON.stringify(required.value)}, `
                + `but ${matches[0].puzzle.id}.${matches[0].output.id} resolves to ${resolved.dataType} ${JSON.stringify(resolved.value)}.`
            );
        }
    }
    for (const binding of discoveryBindings) {
        if (!request.requiredDiscoveries.some((required) => required.id === binding.output.requiredDiscoveryId)) {
            errors.push(`Output ${binding.puzzle.id}.${binding.output.id} references unknown required discovery ${binding.output.requiredDiscoveryId}.`);
        }
    }
    return errors;
}

export function assertLevelBlueprint(value: unknown, catalog: PuzzleCatalog): asserts value is LevelBlueprint {
    const errors = validateLevelBlueprint(value, catalog);
    if (errors.length > 0) throw new Error(`Invalid level blueprint:\n- ${errors.join("\n- ")}`);
}

