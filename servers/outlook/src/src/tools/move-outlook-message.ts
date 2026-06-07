import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";
import { GraphService } from "../simply-outlook/graph-service.js";

export const MOVE_OUTLOOK_MESSAGE_TOOL_NAME = "move-outlook-message";

export const registerMoveOutlookMessageTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${MOVE_OUTLOOK_MESSAGE_TOOL_NAME}`,
    "Move an Outlook email message to a specific folder by folder ID. Use list-outlook-folders tool to get available folder IDs.",
    {
      messageId: z
        .string()
        .describe(
          "The unique identifier of the mail message to move. This is a base64-encoded string that uniquely identifies the message in the user's mailbox. Preserve the exact ID format including any trailing '=' padding characters."
        ),
      destinationFolderId: z
        .string()
        .describe(
          "The unique identifier of the destination folder where the message should be moved. Use the list-outlook-folders tool to get available folder IDs."
        ),
    },
    async ({ messageId, destinationFolderId }) => {
      try {
        await graphService.moveOutlookMessage(messageId, destinationFolderId);
        return textToolResult([`Successfully moved the Outlook message to the specified folder.`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to move Outlook message.");
      }
    }
  );
};
