import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";
import { GraphService } from "../simply-outlook/graph-service.js";

export const LIST_OUTLOOK_FOLDERS_TOOL_NAME = "list-outlook-folders";

const DEFAULT_FOLDERS_LIMIT = 50;
const MAX_FOLDERS_LIMIT = 100;

export const registerListOutlookFoldersTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${LIST_OUTLOOK_FOLDERS_TOOL_NAME}`,
    "Retrieve a list of mail folders from Outlook. This includes both system folders (Inbox, Sent Items, etc.) and custom folders.",
    {
      limit: z
        .number()
        .optional()
        .describe(`Maximum number of folders to return (default: ${DEFAULT_FOLDERS_LIMIT}, maximum allowed: ${MAX_FOLDERS_LIMIT}).`),
    },
    async ({ limit }) => {
      try {
        if (limit && limit > MAX_FOLDERS_LIMIT) {
          throw new Error(`limit is more than max number of folders allowed: ${MAX_FOLDERS_LIMIT}.`);
        }

        const foldersData = await graphService.listMailFolders(limit || DEFAULT_FOLDERS_LIMIT);
        if (!foldersData.length) {
          return textToolResult(["No Outlook folders found."]);
        }

        const folderList = foldersData.map((folder) => ({
          id: folder.id,
          displayName: folder.displayName,
          wellKnownName: folder.wellKnownName || "custom",
        }));

        return textToolResult([
          `Do not show the folder ID to the user unless specifically requested.`,
          `There are ${foldersData.length} Outlook folders:`,
          JSON.stringify(folderList, null, 2),
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to get Outlook folders.");
      }
    }
  );
};
