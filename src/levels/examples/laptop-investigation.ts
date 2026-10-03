import { repositoryPuzzleCatalog } from "../catalog.js";
import { resolveLevelConfig } from "../presets.js";
import { LEVEL_SCHEMA_VERSION, type LevelBlueprint, type LevelDesignRequest } from "../types.js";

export const laptopInvestigationRequest: LevelDesignRequest = {
    levelId: "investigate-alex-laptop",
    titleHint: "The Unsent Message",
    genre: "online-investigation",
    theme: "digital identity and concealed correspondence",
    setting: "a fictional laptop and locally simulated company directory",
    startingSituation: "The player has authorized access to a fictional laptop and must recover the credentials for its local account.",
    playerRole: "authorized digital investigator",
    playerCapabilities: ["browser access", "code execution", "image understanding", "audio processing"],
    playerConstraints: ["use only the supplied fictional environment", "do not access real accounts"],
    environment: { mode: "self-contained" },
    narrativeContext: ["Alex Vale is a fictional character in the investigation."],
    startingInputs: [],
    requiredDiscoveries: [],
    terminalAction: {
        actionType: "account-login",
        description: "Log into the recovered laptop account.",
        requiredOutputs: [
            { id: "username", semanticRole: "account-identifier", dataType: "string" },
            { id: "password", semanticRole: "authentication-secret", dataType: "string" }
        ]
    },
    catalogVersion: repositoryPuzzleCatalog.version,
    config: resolveLevelConfig("easy", {
        structuralDifficulty: {
            puzzleCount: { minimum: 3, maximum: 4 },
            phaseCount: { minimum: 2, maximum: 2 },
            maxParallelPuzzles: 2
        }
    })
};

export const laptopInvestigationLevel: LevelBlueprint = {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    catalogVersion: repositoryPuzzleCatalog.version,
    id: laptopInvestigationRequest.levelId,
    title: "The Unsent Message",
    summary: "Identify the account owner, recover the local username, and decode the password needed to access the laptop.",
    genre: "online-investigation",
    environment: { mode: "self-contained" },
    setting: {
        theme: "digital identity and concealed correspondence",
        location: "Alex Vale's simulated laptop and company intranet",
        tone: "focused investigative mystery"
    },
    startingSituation: laptopInvestigationRequest.startingSituation,
    playerRole: laptopInvestigationRequest.playerRole,
    playerCapabilities: laptopInvestigationRequest.playerCapabilities,
    playerConstraints: laptopInvestigationRequest.playerConstraints,
    startingInputs: [],
    generationConfig: laptopInvestigationRequest.config,
    phases: [
        {
            id: "identify-owner",
            order: 0,
            title: "Identify the account owner",
            summary: "Use the recovered facilities note to identify the employee associated with the laptop."
        },
        {
            id: "recover-credentials",
            order: 1,
            title: "Recover the credentials",
            summary: "Use internal records to find the username and its associated password note."
        }
    ],
    puzzles: [
        {
            id: "identify-employee",
            phaseId: "identify-owner",
            title: "Read the facilities note",
            purpose: "Identify the employee named by the note's line initials.",
            design: {
                puzzleType: "hidden-information",
                subtype: "cover-text-line-acrostic",
                difficulty: "easy",
                hintPolicy: "explicit",
                generationSpec: {
                    mode: "production",
                    id: "identify-employee",
                    intendedSolution: "MORGAN REED",
                    genre: "company facilities notice",
                    coverText: "Maintenance begins after closing.\nOffice keys remain with security.\nReport damaged badges promptly.\nGuests must sign the lobby register.\nAccess cards should never be shared.\nNight staff use the east entrance.\nReturn temporary passes before leaving.\nEmergency exits must remain clear.\nEquipment faults go to facilities.\nDesk drawers are not secure storage."
                },
                verification: {
                    prompt: "Enter the full employee name hidden by the line initials.",
                    dataType: "string",
                    expectedValue: "MORGAN REED"
                },
                inputs: [],
                outputs: [{
                    id: "employee-name",
                    semanticRole: "person-identifier",
                    description: "The employee name used to search the company directory.",
                    from: "verification"
                }]
            },
            generatedContent: {
                status: "mockup",
                preview: {
                    kind: "text",
                    title: "Facilities notice",
                    body: "Maintenance begins after closing.\nOffice keys remain with security.\nReport damaged badges promptly.\nGuests must sign the lobby register.\nAccess cards should never be shared.\nNight staff use the east entrance.\nReturn temporary passes before leaving.\nEmergency exits must remain clear.\nEquipment faults go to facilities.\nDesk drawers are not secure storage.",
                    emphasis: "acrostic"
                }
            }
        },
        {
            id: "find-account-name",
            phaseId: "recover-credentials",
            title: "Search the employee directory",
            purpose: "Use the employee name to select the matching directory record and decode its account handle.",
            design: {
                puzzleType: "encoding",
                subtype: "caesar-cipher",
                difficulty: "easy",
                hintPolicy: "explicit",
                generationSpec: {
                    mode: "production",
                    id: "find-account-name",
                    intendedSolution: "mreed",
                    shift: 5
                },
                verification: {
                    prompt: "Enter the lowercase account handle shown by the matching directory record.",
                    dataType: "string",
                    expectedValue: "mreed"
                },
                inputs: [{
                    id: "employee-name",
                    source: { kind: "puzzle-output", puzzleId: "identify-employee", outputId: "employee-name" },
                    use: "Search the company directory for the matching employee record"
                }],
                outputs: [{
                    id: "username",
                    semanticRole: "account-identifier",
                    description: "The account handle displayed in Morgan Reed's directory record.",
                    from: "verification"
                }]
            },
            generatedContent: {
                status: "mockup",
                preview: {
                    kind: "structured",
                    data: {
                        interface: "Company employee directory",
                        interaction: "Search for the recovered employee name, then decode the account handle in the matching record."
                    }
                }
            }
        },
        {
            id: "recover-password",
            phaseId: "recover-credentials",
            title: "Decode the recovery note",
            purpose: "Use the account handle to open the matching local recovery record and decode its password.",
            design: {
                puzzleType: "encoding",
                subtype: "morse-code",
                difficulty: "easy",
                hintPolicy: "explicit",
                generationSpec: {
                    mode: "production",
                    id: "recover-password",
                    intendedSolution: "EMBER-0420"
                },
                verification: {
                    prompt: "Enter the password exactly as decoded, including capitalization and punctuation.",
                    dataType: "string",
                    expectedValue: "EMBER-0420"
                },
                inputs: [{
                    id: "username",
                    source: { kind: "puzzle-output", puzzleId: "find-account-name", outputId: "username" },
                    use: "Select the recovery record belonging to the recovered account handle"
                }],
                outputs: [{
                    id: "password",
                    semanticRole: "authentication-secret",
                    description: "The password decoded from the account's recovery record.",
                    from: "verification"
                }]
            },
            generatedContent: {
                status: "mockup",
                preview: {
                    kind: "text",
                    title: "Local recovery record",
                    body: "The record for mreed contains a short Morse-encoded credential.",
                    emphasis: "code"
                }
            }
        }
    ],
    terminalAction: {
        id: "login-to-laptop",
        actionType: "account-login",
        title: "Log into the recovered laptop",
        description: laptopInvestigationRequest.terminalAction.description,
        interaction: "exact-field-form",
        fields: [
            {
                id: "username",
                label: "Username",
                semanticRole: "account-identifier",
                source: { puzzleId: "find-account-name", outputId: "username" }
            },
            {
                id: "password",
                label: "Password",
                semanticRole: "authentication-secret",
                source: { puzzleId: "recover-password", outputId: "password" }
            }
        ],
        successOutcome: "The laptop account opens and the investigator gains access to the local email inbox."
    },
    externalContentRequirements: []
};
