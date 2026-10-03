import Value from "typebox/value";

import { getTerminalAction } from "./action-catalog.js";
import { assertPuzzleCatalog, getPuzzleCatalogEntry, type PuzzleCatalog } from "./catalog.js";
import {
    applyTransformation,
    getTransformation,
    transformationDifficultyRank
} from "./transformation-catalog.js";
import {
    GameLevelManifestSchema,
    LEVEL_SCHEMA_VERSION,
    LevelBlueprintSchema,
    type GameLevelManifest,
    type LevelBlueprint,
    type LevelDesignRequest,
    type PuzzleOutput,
    type ScalarDataType
} from "./types.js";

interface ResolvedValue {
    dataType: ScalarDataType;
    value: string | number;
}

function duplicateValues(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
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

function graphShape(ids: string[], edges: Array<{ from: string; to: string }>): {
    hasCycle: boolean;
    maxWidth: number;
    ancestors: (targets: Iterable<string>) => Set<string>;
} {
    const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
    const incoming = new Map(ids.map((id) => [id, [] as string[]]));
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const edge of edges) {
        if (!outgoing.has(edge.from) || !incoming.has(edge.to)) continue;
        outgoing.get(edge.from)?.push(edge.to);
        incoming.get(edge.to)?.push(edge.from);
        indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }

    let frontier = ids.filter((id) => indegree.get(id) === 0);
    let visited = 0;
    let maxWidth = frontier.length;
    while (frontier.length > 0) {
        visited += frontier.length;
        const next: string[] = [];
        for (const id of frontier) {
            for (const target of outgoing.get(id) ?? []) {
                const remaining = (indegree.get(target) ?? 0) - 1;
                indegree.set(target, remaining);
                if (remaining === 0) next.push(target);
            }
        }
        frontier = next;
        maxWidth = Math.max(maxWidth, frontier.length);
    }

    return {
        hasCycle: visited !== ids.length,
        maxWidth,
        ancestors(targets) {
            const result = new Set<string>();
            const pending = [...targets];
            while (pending.length > 0) {
                const current = pending.pop() as string;
                if (result.has(current)) continue;
                result.add(current);
                pending.push(...(incoming.get(current) ?? []));
            }
            return result;
        }
    };
}

export function validateLevelBlueprint(value: unknown, catalog: PuzzleCatalog): string[] {
    assertPuzzleCatalog(catalog);
    if (!Value.Check(LevelBlueprintSchema, value)) return ["Level does not satisfy the canonical level schema."];
    const level = value as LevelBlueprint;
    const errors: string[] = [];

    if (level.schemaVersion !== LEVEL_SCHEMA_VERSION) {
        errors.push(`Unsupported schema version ${level.schemaVersion}; expected ${LEVEL_SCHEMA_VERSION}.`);
    }
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
    for (const duplicate of duplicateValues(phaseIds)) errors.push(`Duplicate phase ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(phaseOrders)) errors.push(`Duplicate phase order: ${duplicate}.`);
    for (const duplicate of duplicateValues(puzzleIds)) errors.push(`Duplicate puzzle ID: ${duplicate}.`);
    for (const duplicate of duplicateValues(startingInputIds)) errors.push(`Duplicate starting-input ID: ${duplicate}.`);

    const phaseMap = new Map(level.phases.map((phase) => [phase.id, phase]));
    const puzzleMap = new Map(level.puzzles.map((puzzle) => [puzzle.id, puzzle]));
    const startingInputMap = new Map(level.startingInputs.map((input) => [input.id, input]));
    const edges: Array<{ from: string; to: string }> = [];
    const consumedOutputs = new Map<string, number>();
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
            if (!entry.supportedHintPolicies.includes(design.hintPolicy)) errors.push(`Puzzle ${puzzle.id} uses unsupported hint policy ${design.hintPolicy}.`);
            if (!Value.Check(entry.generationSpecSchema, design.generationSpec)) errors.push(`Puzzle ${puzzle.id} has an invalid generationSpec for ${design.subtype}.`);
        }
        if (design.generationSpec.id !== puzzle.id) errors.push(`Puzzle ${puzzle.id} generationSpec must preserve the same ID.`);
        if (JSON.stringify(design.generationSpec.intendedSolution) !== JSON.stringify(design.verification.expectedValue)) {
            errors.push(`Puzzle ${puzzle.id} verification answer must match generationSpec.intendedSolution.`);
        }

        for (const duplicate of duplicateValues(design.inputs.map((input) => input.id))) errors.push(`Puzzle ${puzzle.id} has duplicate input ${duplicate}.`);
        for (const duplicate of duplicateValues(design.outputs.map((output) => output.id))) errors.push(`Puzzle ${puzzle.id} has duplicate output ${duplicate}.`);
        const hasRevealedOutput = design.outputs.some((output) => output.from === "revealed");
        if (hasRevealedOutput && design.revealContext === undefined) errors.push(`Puzzle ${puzzle.id} must explain how its separately revealed outputs become available.`);
        if (!hasRevealedOutput && design.revealContext !== undefined) errors.push(`Puzzle ${puzzle.id} has revealContext but no separately revealed outputs.`);

        for (const input of design.inputs) {
            let sourceValue: ResolvedValue | undefined;
            if (input.source.kind === "starting-input") {
                const source = startingInputMap.get(input.source.inputId);
                if (source === undefined) errors.push(`Puzzle ${puzzle.id} input ${input.id} references missing starting input ${input.source.inputId}.`);
                else {
                    sourceValue = { dataType: source.dataType, value: source.value };
                    consumedStartingInputs.add(source.id);
                }
            } else {
                if (input.source.puzzleId === puzzle.id) errors.push(`Puzzle ${puzzle.id} input ${input.id} cannot depend on itself.`);
                sourceValue = resolvePuzzleOutput(level, input.source.puzzleId, input.source.outputId);
                if (sourceValue === undefined) {
                    errors.push(`Puzzle ${puzzle.id} input ${input.id} references missing output ${input.source.puzzleId}.${input.source.outputId}.`);
                } else {
                    const key = `${input.source.puzzleId}.${input.source.outputId}`;
                    consumedOutputs.set(key, (consumedOutputs.get(key) ?? 0) + 1);
                    edges.push({ from: input.source.puzzleId, to: puzzle.id });
                    const sourcePhase = phaseMap.get(puzzleMap.get(input.source.puzzleId)?.phaseId ?? "");
                    if (sourcePhase !== undefined && phase !== undefined && sourcePhase.order > phase.order) {
                        errors.push(`Puzzle ${puzzle.id} depends on later phase ${sourcePhase.id}.`);
                    }
                }
            }

            if (input.transform !== undefined) {
                transformationCount += 1;
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
                        if (JSON.stringify(transformed) === JSON.stringify(sourceValue.value)) errors.push(`Transformation ${input.transform.type} on ${puzzle.id}.${input.id} does not change the source value; omit it.`);
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
        if (!consumedStartingInputs.has(input.id)) errors.push(`Starting input ${input.id} is not consumed by any puzzle.`);
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
    const terminalProducerIds = new Set<string>();
    for (const field of level.terminalAction.fields) {
        const resolved = resolvePuzzleOutput(level, field.source.puzzleId, field.source.outputId);
        if (resolved === undefined) errors.push(`Terminal field ${field.id} references missing output ${field.source.puzzleId}.${field.source.outputId}.`);
        else {
            const key = `${field.source.puzzleId}.${field.source.outputId}`;
            consumedOutputs.set(key, (consumedOutputs.get(key) ?? 0) + 1);
            terminalProducerIds.add(field.source.puzzleId);
        }
    }

    for (const puzzle of level.puzzles) {
        for (const output of puzzle.design.outputs) {
            const key = `${puzzle.id}.${output.id}`;
            if ((consumedOutputs.get(key) ?? 0) === 0) errors.push(`Puzzle output ${key} is not consumed downstream or by the terminal action.`);
        }
    }

    const graph = graphShape(puzzleIds, edges);
    if (graph.hasCycle) errors.push("Puzzle data flow must form a directed acyclic graph.");
    if (graph.maxWidth > structure.maxParallelPuzzles) errors.push(`Graph width ${graph.maxWidth} exceeds configured maximum parallel puzzles ${structure.maxParallelPuzzles}.`);
    if (!graph.hasCycle) {
        const contributors = graph.ancestors(terminalProducerIds);
        for (const puzzleId of puzzleIds) if (!contributors.has(puzzleId)) errors.push(`Puzzle ${puzzleId} does not contribute to the terminal action.`);
    }

    if (level.environment.mode === "self-contained" && level.externalContentRequirements.length > 0) {
        errors.push("Self-contained levels cannot declare external public content requirements.");
    }
    if (level.environment.mode === "external-public") {
        for (const requirement of level.externalContentRequirements) {
            if (!level.environment.platforms.includes(requirement.platform)) errors.push(`External requirement ${requirement.id} uses undeclared platform ${requirement.platform}.`);
            if (requirement.status === "deployed" && requirement.url === undefined) errors.push(`Deployed external requirement ${requirement.id} must include a URL.`);
        }
    }

    return errors;
}

export function validateLevelAgainstRequest(level: LevelBlueprint, request: LevelDesignRequest, catalog: PuzzleCatalog): string[] {
    const errors = validateLevelBlueprint(level, catalog);
    if (level.id !== request.levelId) errors.push(`Level ID must remain ${request.levelId}.`);
    if (level.catalogVersion !== request.catalogVersion) errors.push("Level must use the requested puzzle catalog version.");
    if (level.genre !== request.genre) errors.push(`Level genre must remain ${request.genre}.`);
    if (JSON.stringify(level.environment) !== JSON.stringify(request.environment)) errors.push("Level environment must match the game-design request.");
    if (JSON.stringify(level.startingInputs) !== JSON.stringify(request.startingInputs)) errors.push("Level starting inputs must match the game-design request.");
    if (level.terminalAction.actionType !== request.terminalAction.actionType) errors.push("Terminal action type must match the game-design request.");
    if (level.terminalAction.description !== request.terminalAction.description) errors.push("Terminal action description must match the game-design request.");

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
        if (required.requiredValue !== undefined && resolved !== undefined && JSON.stringify(resolved.value) !== JSON.stringify(required.requiredValue)) {
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
        if (resolved.dataType !== required.dataType || JSON.stringify(resolved.value) !== JSON.stringify(required.value)) {
            errors.push(`Required discovery ${required.id} does not match its game-defined type and value.`);
        }
    }
    for (const binding of discoveryBindings) {
        if (!request.requiredDiscoveries.some((required) => required.id === binding.output.requiredDiscoveryId)) {
            errors.push(`Output ${binding.puzzle.id}.${binding.output.id} references unknown required discovery ${binding.output.requiredDiscoveryId}.`);
        }
    }
    return errors;
}

export function validateGameLevelManifest(value: unknown): string[] {
    if (!Value.Check(GameLevelManifestSchema, value)) return ["Game-level manifest does not satisfy the canonical schema."];
    const manifest = value as GameLevelManifest;
    const errors: string[] = [];
    const ids = manifest.levels.map((level) => level.id);
    const idSet = new Set(ids);
    for (const duplicate of duplicateValues(ids)) errors.push(`Duplicate level ID: ${duplicate}.`);
    const hierarchyEdges: Array<{ from: string; to: string }> = [];
    const prerequisiteEdges: Array<{ from: string; to: string }> = [];
    for (const level of manifest.levels) {
        if (level.parentLevelId !== undefined && !idSet.has(level.parentLevelId)) errors.push(`Level ${level.id} references missing parent ${level.parentLevelId}.`);
        if (level.parentLevelId === level.id) errors.push(`Level ${level.id} cannot be its own parent.`);
        if (level.parentLevelId !== undefined) hierarchyEdges.push({ from: level.parentLevelId, to: level.id });
        for (const prerequisite of level.prerequisiteLevelIds) {
            if (!idSet.has(prerequisite)) errors.push(`Level ${level.id} references missing prerequisite ${prerequisite}.`);
            if (prerequisite === level.id) errors.push(`Level ${level.id} cannot require itself.`);
            prerequisiteEdges.push({ from: prerequisite, to: level.id });
        }
    }
    if (graphShape(ids, hierarchyEdges).hasCycle) errors.push("Level hierarchy must be acyclic.");
    if (graphShape(ids, prerequisiteEdges).hasCycle) errors.push("Level prerequisites must be acyclic.");
    return errors;
}

export function assertLevelBlueprint(value: unknown, catalog: PuzzleCatalog): asserts value is LevelBlueprint {
    const errors = validateLevelBlueprint(value, catalog);
    if (errors.length > 0) throw new Error(`Invalid level blueprint:\n- ${errors.join("\n- ")}`);
}
