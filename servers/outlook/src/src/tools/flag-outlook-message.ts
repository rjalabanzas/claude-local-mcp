import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const FLAG_OUTLOOK_MESSAGE_TOOL_NAME = "flag-outlook-message";

export const registerFlagOutlookMessageTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${FLAG_OUTLOOK_MESSAGE_TOOL_NAME}`,
    "Set or update the flag status of an Outlook message. You can flag a message for follow-up, mark it as complete, or clear the flag. Optionally set start and due dates for flagged items.",
    {
      messageId: z
        .string()
        .describe(
          "The unique identifier of the message to flag. This ID can be obtained from get-outlook-messages or search-outlook-messages tools."
        ),
      flagStatus: z
        .enum(["flagged", "complete", "notFlagged"])
        .describe("The flag status to set: 'flagged' (flag for follow-up), 'complete' (mark as done), or 'notFlagged' (clear flag)"),
      startDate: z
        .string()
        .optional()
        .describe(
          "Optional start date/time for the flagged item in ISO 8601 format (e.g., '2024-12-31T09:00:00'). Only applies when flagStatus is 'flagged'. UTC timezone is used."
        ),
      dueDate: z
        .string()
        .optional()
        .describe(
          "Optional due date/time for the flagged item in ISO 8601 format (e.g., '2024-12-31T17:00:00'). Only applies when flagStatus is 'flagged'. UTC timezone is used."
        ),
    },
    async ({ messageId, flagStatus, startDate, dueDate }) => {
      try {
        await graphService.flagOutlookMessage(messageId, flagStatus, startDate, dueDate);

        let statusText = "";
        switch (flagStatus) {
          case "flagged":
            statusText = "Message flagged for follow-up";
            if (dueDate) {
              statusText += ` with due date: ${dueDate}`;
            }
            break;
          case "complete":
            statusText = "Message flag marked as complete";
            break;
          case "notFlagged":
            statusText = "Message flag cleared";
            break;
        }

        return textToolResult([`Message flag updated successfully.`, statusText]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to update message flag.");
      }
    }
  );
};



