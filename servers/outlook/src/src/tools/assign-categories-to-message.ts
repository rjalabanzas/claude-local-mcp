import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const ASSIGN_CATEGORIES_TO_MESSAGE_TOOL_NAME = "assign-categories-to-message";

export const registerAssignCategoriesToMessageTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${ASSIGN_CATEGORIES_TO_MESSAGE_TOOL_NAME}`,
    "Assign or update categories for an Outlook message. This replaces any existing categories with the new list provided. Use an empty array to remove all categories from the message.",
    {
      messageId: z
        .string()
        .describe(
          "The unique identifier of the message to update. This ID can be obtained from get-outlook-messages or search-outlook-messages tools."
        ),
      categories: z
        .string()
        .array()
        .describe(
          "Array of category display names to assign to the message (e.g., ['Important', 'Work']). Use empty array [] to remove all categories. The categories must already exist as master categories."
        ),
    },
    async ({ messageId, categories }) => {
      try {
        await graphService.assignCategoriesToMessage(messageId, categories);

        const categoryText =
          categories.length > 0 ? `Categories assigned: ${categories.join(", ")}` : "All categories removed from the message";

        return textToolResult([`Message categories updated successfully.`, categoryText]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to assign categories to message.");
      }
    }
  );
};
