import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const LIST_OUTLOOK_CATEGORIES_TOOL_NAME = "list-outlook-categories";

export const registerListOutlookCategoriesTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${LIST_OUTLOOK_CATEGORIES_TOOL_NAME}`,
    "List all master categories defined in the user's Outlook mailbox. Master categories can be assigned to calendar events and messages for organization.",
    {},
    async () => {
      try {
        const categories = await graphService.listOutlookCategories();

        if (!categories.length) {
          return textToolResult(["No categories found."]);
        }

        return textToolResult([`Found ${categories.length} categories:`, JSON.stringify(categories)]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list Outlook categories.");
      }
    }
  );
};
