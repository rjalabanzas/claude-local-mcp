import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const DELETE_OUTLOOK_CATEGORY_TOOL_NAME = "delete-outlook-category";

export const registerDeleteOutlookCategoryTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${DELETE_OUTLOOK_CATEGORY_TOOL_NAME}`,
    "Delete a master category from Outlook. Note: Deleting a category will remove it from all items (events and messages) that use it.",
    {
      id: z
        .string()
        .describe("The unique identifier of the category to delete. This ID can be obtained from the list-outlook-categories tool."),
    },
    async ({ id }) => {
      try {
        await graphService.deleteOutlookCategory(id);

        return textToolResult([`Category deleted successfully.`, `The category has been removed from all calendar events and messages.`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to delete Outlook category.");
      }
    }
  );
};
