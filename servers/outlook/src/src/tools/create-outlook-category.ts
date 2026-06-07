import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const CREATE_OUTLOOK_CATEGORY_TOOL_NAME = "create-outlook-category";

export const registerCreateOutlookCategoryTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${CREATE_OUTLOOK_CATEGORY_TOOL_NAME}`,
    "Create a new master category in Outlook with a specified name and color. Master categories can then be assigned to calendar events and messages.",
    {
      displayName: z.string().describe("The display name for the category (e.g., 'Important', 'Work', 'Personal')"),
      color: z
        .enum([
          "none",
          "preset0",
          "preset1",
          "preset2",
          "preset3",
          "preset4",
          "preset5",
          "preset6",
          "preset7",
          "preset8",
          "preset9",
          "preset10",
          "preset11",
          "preset12",
          "preset13",
          "preset14",
          "preset15",
          "preset16",
          "preset17",
          "preset18",
          "preset19",
          "preset20",
          "preset21",
          "preset22",
          "preset23",
          "preset24",
        ])
        .optional()
        .describe(
          "Optional color preset for the category. Available presets: none, preset0-preset24 (correspond to different colors in Outlook). Defaults to 'none' if not specified."
        ),
    },
    async ({ displayName, color }) => {
      try {
        const category = await graphService.createOutlookCategory(displayName, color);

        return textToolResult([`Category created successfully:`, JSON.stringify(category)]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to create Outlook category.");
      }
    }
  );
};
