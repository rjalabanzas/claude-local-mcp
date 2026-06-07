import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const DELETE_CALENDAR_EVENT_TOOL_NAME = "delete-calendar-event";

export const registerDeleteCalendarEventTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${DELETE_CALENDAR_EVENT_TOOL_NAME}`,
    "Delete (cancel) an existing calendar event in Outlook. This permanently removes the event from the calendar. If the event has attendees, they will receive a cancellation notification.",
    {
      id: z
        .string()
        .describe(
          "This is a base64-encoded string that uniquely identifies the calendar event to delete. Preserve the exact ID format including any trailing '=' padding characters."
        ),
    },
    async ({ id }) => {
      try {
        await graphService.deleteCalendarEvent(id);

        return textToolResult([`Calendar event deleted successfully.`, `The event has been permanently removed from the calendar.`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to delete calendar event.");
      }
    }
  );
};
