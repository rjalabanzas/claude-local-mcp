import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";
import { GraphService } from "../simply-outlook/graph-service.js";

export const LIST_CALENDARS_TOOL_NAME = "list-calendars";

export const registerListCalendarsTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${LIST_CALENDARS_TOOL_NAME}`,
    "Retrieve a list of calendars from Outlook. This includes your personal calendar as well as calendars shared with you.",
    {},
    async () => {
      try {
        const calendars = await graphService.getCalendars();
        if (!calendars.length) {
          return textToolResult(["No calendars found."]);
        }

        const calendarList = calendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name || "Untitled Calendar",
          owner: calendar.owner?.name || calendar.owner?.address || "Unknown",
          canEdit: calendar.canEdit !== undefined ? calendar.canEdit : null,
          canShare: calendar.canShare !== undefined ? calendar.canShare : null,
          canViewPrivateItems: calendar.canViewPrivateItems !== undefined ? calendar.canViewPrivateItems : null,
        }));

        return textToolResult([
          `Do not show the calendar ID to the user unless specifically requested.`,
          `There are ${calendars.length} calendars available:`,
          JSON.stringify(calendarList, null, 2),
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to get calendars.");
      }
    }
  );
};

