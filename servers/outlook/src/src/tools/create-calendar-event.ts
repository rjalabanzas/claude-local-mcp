import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GraphService } from "../simply-outlook/graph-service.js";
import { getErrorToolResult, textToolResult, toCalendarEventResult } from "./tool-utils.js";

export const CREATE_CALENDAR_EVENT_TOOL_NAME = "create-calendar-event";

const DEFAULT_EVENT_DURATION_MINUTES = 30;

export const registerCreateCalendarEventTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${CREATE_CALENDAR_EVENT_TOOL_NAME}`,
    "Create a personal calendar event in Outlook without sending invitations to other attendees. This creates a private event only on the user's calendar. You can specify a calendarId to create the event in a specific calendar (including shared calendars).",
    {
      subject: z.string().describe("The title/subject of the calendar event"),
      startDateTime: z
        .string()
        .describe(
          "The event start date and time in ISO format using local time zone. Format: 'YYYY-MM-DDTHH:mm:ss' (e.g., '2025-12-25T14:30:00')"
        ),
      endDateTime: z
        .string()
        .optional()
        .describe(
          `The event end date and time in ISO format using local time zone. Optional - if not provided, the event will last ${DEFAULT_EVENT_DURATION_MINUTES} minutes. Format: 'YYYY-MM-DDTHH:mm:ss' (e.g., '2025-12-25T15:00:00')`
        ),
      location: z
        .string()
        .optional()
        .describe("Optional location or venue for the event (e.g., 'Conference Room A', 'Airport', 'Central Park')"),
      content: z
        .string()
        .optional()
        .describe("Optional description or body content for the event. Must be in markdown or plain text format."),
      categories: z
        .string()
        .array()
        .optional()
        .describe(
          "Optional array of category display names to assign to the event (e.g., ['Important', 'Work']). The categories must already exist as master categories."
        ),
      recurrence: z
        .object({
          pattern: z
            .object({
              type: z.enum(["daily", "weekly", "absoluteMonthly", "relativeMonthly", "absoluteYearly", "relativeYearly"]),
              interval: z.number().int().positive().describe("The interval between occurrences"),
              daysOfWeek: z
                .array(z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]))
                .optional()
                .describe("Days of the week for weekly recurrence (e.g., ['monday', 'wednesday'])"),
            }),
          range: z
            .object({
              type: z.enum(["endDate", "noEnd", "numbered"]),
              endDate: z.string().optional().describe("End date in YYYY-MM-DD format (required if type is 'endDate')"),
              numberOfOccurrences: z.number().int().positive().optional().describe("Number of occurrences (required if type is 'numbered')"),
            }),
        })
        .optional()
        .describe("Recurrence pattern for the event"),
      calendarId: z
        .string()
        .optional()
        .describe("Optional calendar ID to create the event in. If not provided, the event will be created in the user's default calendar. Use list-calendars to get available calendar IDs."),
    },
    async ({ subject, content, startDateTime, endDateTime, location, categories, recurrence, calendarId }) => {
      try {
        const startDateTimeUtc = new Date(startDateTime).toISOString();

        let calculatedEndDateTime = endDateTime;
        if (!calculatedEndDateTime) {
          const startDate = new Date(startDateTime);
          startDate.setMinutes(startDate.getMinutes() + DEFAULT_EVENT_DURATION_MINUTES);
          calculatedEndDateTime = startDate.toISOString();
        }

        const endDateTimeUtc = new Date(calculatedEndDateTime).toISOString();
        const eventData = await graphService.createCalendarEvent(
          subject,
          content || "",
          startDateTimeUtc,
          endDateTimeUtc,
          undefined,
          location,
          undefined,
          categories,
          recurrence,
          calendarId
        );
        return textToolResult([
          `Do not show the event ID to the user.`,
          `Event created successfully:`,
          JSON.stringify(toCalendarEventResult(eventData)),
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to create calendar event.");
      }
    }
  );
};
