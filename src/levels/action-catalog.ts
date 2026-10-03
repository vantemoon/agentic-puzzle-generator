export interface TerminalActionCatalogEntry {
    id: string;
    displayName: string;
    description: string;
    interaction: "exact-field-form";
    minimumFields: number;
    maximumFields: number;
    requiredSemanticRoles: string[];
    supportedSemanticRoles: string[];
    narrativeRequirement: string;
}

export const terminalActionCatalog: TerminalActionCatalogEntry[] = [
    {
        id: "account-login",
        displayName: "Account login",
        description: "Authenticate to an account or recovered device.",
        interaction: "exact-field-form",
        minimumFields: 2,
        maximumFields: 2,
        requiredSemanticRoles: ["account-identifier", "authentication-secret"],
        supportedSemanticRoles: ["account-identifier", "authentication-secret"],
        narrativeRequirement: "The player has legitimate access to a relevant login interface."
    },
    {
        id: "archive-open",
        displayName: "Open archive",
        description: "Open a specific protected archive or evidence package.",
        interaction: "exact-field-form",
        minimumFields: 2,
        maximumFields: 2,
        requiredSemanticRoles: ["resource-identifier", "authentication-secret"],
        supportedSemanticRoles: ["resource-identifier", "authentication-secret"],
        narrativeRequirement: "The player has located the archive and a believable interface for opening it."
    },
    {
        id: "database-search",
        displayName: "Database search",
        description: "Submit exact filters to retrieve one relevant record.",
        interaction: "exact-field-form",
        minimumFields: 1,
        maximumFields: 4,
        requiredSemanticRoles: [],
        supportedSemanticRoles: ["record-selector", "person-identifier", "date", "location", "keyword"],
        narrativeRequirement: "The player has access to a database whose fields naturally accept the supplied filters."
    },
    {
        id: "file-retrieval",
        displayName: "Retrieve file",
        description: "Retrieve a specific file from an available system.",
        interaction: "exact-field-form",
        minimumFields: 1,
        maximumFields: 2,
        requiredSemanticRoles: ["resource-identifier"],
        supportedSemanticRoles: ["resource-identifier", "path"],
        narrativeRequirement: "The player has access to the storage system that contains the file."
    },
    {
        id: "message-open",
        displayName: "Open message",
        description: "Locate and open one specific message in an available mailbox or archive.",
        interaction: "exact-field-form",
        minimumFields: 1,
        maximumFields: 4,
        requiredSemanticRoles: [],
        supportedSemanticRoles: ["message-identifier", "sender", "recipient", "date", "keyword"],
        narrativeRequirement: "The player has access to the mailbox or message archive."
    },
    {
        id: "evidence-submission",
        displayName: "Submit evidence",
        description: "Submit one or more exact findings to a fictional investigation system.",
        interaction: "exact-field-form",
        minimumFields: 1,
        maximumFields: 4,
        requiredSemanticRoles: [],
        supportedSemanticRoles: ["finding", "person-identifier", "resource-identifier", "date", "location"],
        narrativeRequirement: "The fields correspond to a believable report or case interface, not an arbitrary quiz form."
    }
];

export function getTerminalAction(actionType: string): TerminalActionCatalogEntry | undefined {
    return terminalActionCatalog.find((entry) => entry.id === actionType);
}

export function terminalActionsForPrompt(): unknown {
    return terminalActionCatalog;
}
