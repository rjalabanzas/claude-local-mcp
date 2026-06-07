import { TokenCredential } from "@azure/identity";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConsoleLogger } from "./common/console-logger.js";
import { VERSION } from "./version.js";
import { GraphService } from "./simply-outlook/graph-service.js";
import { SimplyOutlookMcpEnvs } from "./simply-outlook-mcp.types.js";
import { registerGetCalendarEventsTool, GET_CALENDAR_EVENTS_TOOL_NAME } from "./tools/get-calendar-events.js";
import { registerCreateCalendarEventTool, CREATE_CALENDAR_EVENT_TOOL_NAME } from "./tools/create-calendar-event.js";
import { registerUpdateCalendarEventTool, UPDATE_CALENDAR_EVENT_TOOL_NAME } from "./tools/update-calendar-event.js";
import { registerDeleteCalendarEventTool, DELETE_CALENDAR_EVENT_TOOL_NAME } from "./tools/delete-calendar-event.js";
import {
  registerCreateCalendarEventWithInviteTool,
  CREATE_CALENDAR_EVENT_WITH_INVITE_TOOL_NAME,
} from "./tools/create-calendar-event-with-invite.js";
import { registerGetOutlookMessagesTool, GET_OUTLOOK_MESSAGES_TOOL_NAME } from "./tools/get-outlook-messages.js";
import { registerSearchOutlookMessagesTool, SEARCH_OUTLOOK_MESSAGES_TOOL_NAME } from "./tools/search-outlook-messages.js";
import { registerGetOutlookMessageContentTool, GET_OUTLOOK_MESSAGE_CONTENT_TOOL_NAME } from "./tools/get-outlook-message-content.js";
import { registerSendOutlookMessageTool, SEND_OUTLOOK_MESSAGE_TOOL_NAME } from "./tools/send-outlook-message.js";
import { registerReplyOutlookMessageTool, REPLY_OUTLOOK_MESSAGE_TOOL_NAME } from "./tools/reply-outlook-message.js";
import { registerListOutlookFoldersTool, LIST_OUTLOOK_FOLDERS_TOOL_NAME } from "./tools/list-outlook-folders.js";
import { registerListCalendarsTool, LIST_CALENDARS_TOOL_NAME } from "./tools/list-calendars.js";
import { registerMoveOutlookMessageTool, MOVE_OUTLOOK_MESSAGE_TOOL_NAME } from "./tools/move-outlook-message.js";
import { registerListOutlookCategoriesTool, LIST_OUTLOOK_CATEGORIES_TOOL_NAME } from "./tools/list-outlook-categories.js";
import { registerCreateOutlookCategoryTool, CREATE_OUTLOOK_CATEGORY_TOOL_NAME } from "./tools/create-outlook-category.js";
import { registerDeleteOutlookCategoryTool, DELETE_OUTLOOK_CATEGORY_TOOL_NAME } from "./tools/delete-outlook-category.js";
import { registerAssignCategoriesToMessageTool, ASSIGN_CATEGORIES_TO_MESSAGE_TOOL_NAME } from "./tools/assign-categories-to-message.js";
import { registerFlagOutlookMessageTool, FLAG_OUTLOOK_MESSAGE_TOOL_NAME } from "./tools/flag-outlook-message.js";

export const SIMPLY_OUTLOOK_MCP_SCOPES = ["Calendars.ReadWrite", "Mail.ReadWrite", "Mail.Send", "Mail.Send.Shared", "User.Read"];

type ToolRegistration = (mcpServer: McpServer, graphService: GraphService, toolNamePrefix: string) => Promise<void>;

const TOOL_DEFS: { name: string; tool: ToolRegistration }[] = [
  { name: GET_CALENDAR_EVENTS_TOOL_NAME, tool: registerGetCalendarEventsTool },
  { name: CREATE_CALENDAR_EVENT_TOOL_NAME, tool: registerCreateCalendarEventTool },
  { name: UPDATE_CALENDAR_EVENT_TOOL_NAME, tool: registerUpdateCalendarEventTool },
  { name: DELETE_CALENDAR_EVENT_TOOL_NAME, tool: registerDeleteCalendarEventTool },
  { name: CREATE_CALENDAR_EVENT_WITH_INVITE_TOOL_NAME, tool: registerCreateCalendarEventWithInviteTool },
  { name: GET_OUTLOOK_MESSAGES_TOOL_NAME, tool: registerGetOutlookMessagesTool },
  { name: SEARCH_OUTLOOK_MESSAGES_TOOL_NAME, tool: registerSearchOutlookMessagesTool },
  { name: GET_OUTLOOK_MESSAGE_CONTENT_TOOL_NAME, tool: registerGetOutlookMessageContentTool },
  { name: SEND_OUTLOOK_MESSAGE_TOOL_NAME, tool: registerSendOutlookMessageTool },
  { name: REPLY_OUTLOOK_MESSAGE_TOOL_NAME, tool: registerReplyOutlookMessageTool },
  { name: LIST_OUTLOOK_FOLDERS_TOOL_NAME, tool: registerListOutlookFoldersTool },
  { name: LIST_CALENDARS_TOOL_NAME, tool: registerListCalendarsTool },
  { name: MOVE_OUTLOOK_MESSAGE_TOOL_NAME, tool: registerMoveOutlookMessageTool },
  { name: LIST_OUTLOOK_CATEGORIES_TOOL_NAME, tool: registerListOutlookCategoriesTool },
  { name: CREATE_OUTLOOK_CATEGORY_TOOL_NAME, tool: registerCreateOutlookCategoryTool },
  { name: DELETE_OUTLOOK_CATEGORY_TOOL_NAME, tool: registerDeleteOutlookCategoryTool },
  { name: ASSIGN_CATEGORIES_TO_MESSAGE_TOOL_NAME, tool: registerAssignCategoriesToMessageTool },
  { name: FLAG_OUTLOOK_MESSAGE_TOOL_NAME, tool: registerFlagOutlookMessageTool },
];

export const createMcpServer = async (credential: TokenCredential): Promise<McpServer> => {
  const disabledToolsStr = process.env[SimplyOutlookMcpEnvs.SIMPLY_OUTLOOK_MCP_DISABLED_TOOLS];
  const disabledTools = new Set<string>(
    disabledToolsStr
      ? disabledToolsStr
          .split(",")
          .map((tool) => tool.trim().toLowerCase())
          .filter((tool) => !!tool)
      : []
  );

  const toolNamePrefix = process.env[SimplyOutlookMcpEnvs.TOOL_NAME_PREFIX] || "";

  const graphService = new GraphService(new ConsoleLogger("GraphService", true), credential, SIMPLY_OUTLOOK_MCP_SCOPES);
  if (!(await graphService.isAuthenticated())) {
    throw new Error("Please run 'npx simply-outlook-mcp --auth --client_id <CLIENT ID>' before using for the first time.");
  }

  const mcpServer = new McpServer({
    name: "simply-outlook-mcp",
    version: VERSION,
  });

  for (const toolDef of TOOL_DEFS) {
    if (!disabledTools.has(toolDef.name)) {
      await toolDef.tool(mcpServer, graphService, toolNamePrefix);
    }
  }

  return mcpServer;
};
