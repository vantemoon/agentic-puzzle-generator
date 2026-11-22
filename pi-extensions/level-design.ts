import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { buildLevelDesignPrompt } from "../src/features/level-design/agent/prompt.js";
import { createSubmitLevelBlueprintTool } from "../src/features/level-design/agent/tool.js";
import { repositoryPuzzleCatalog } from "../src/features/puzzle-generation/catalog.js";
import { loadLevelDesignInputs } from "../src/features/level-design/io.js";
import type { LevelDesignRequest } from "../src/features/level-design/types.js";

export default function levelDesignExtension(pi: ExtensionAPI) {
    let request: LevelDesignRequest | undefined;
    let loadedRequestFile: string | undefined;
    pi.registerTool(createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, () => request));
    pi.on("before_agent_start", async (event) => {
        const requestFile = process.env.LEVEL_DESIGN_REQUEST_FILE;
        if (requestFile === undefined || requestFile.length === 0) {
            throw new Error("Level design requires a request file through the level:design command.");
        }
        if (request === undefined || loadedRequestFile !== requestFile) {
            const inputs = await loadLevelDesignInputs({ requestFile });
            request = inputs.request;
            loadedRequestFile = requestFile;
        }
        event.systemPromptOptions.sections["level-design-agent"] = buildLevelDesignPrompt(
            repositoryPuzzleCatalog,
            request
        );
    });
}
