import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";
import { attachmentInputSchema } from "./schemas.js";
import { GraphService } from "../simply-outlook/graph-service.js";

export const SEND_OUTLOOK_MESSAGE_TOOL_NAME = "send-outlook-message";

export const registerSendOutlookMessageTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${SEND_OUTLOOK_MESSAGE_TOOL_NAME}`,
    "Send a new mail message through Outlook to specified recipients. Pass signaturePath to append the user's signature (markdown + any local images) at the bottom of the message.",
    {
      subject: z.string().describe("The subject line of the email message."),
      content: z.string().describe("The content/body of the email message. Must be in markdown or plain text format."),
      recipientEmails: z.string().array().describe("Array of email addresses to send the message to."),
      attachments: attachmentInputSchema
        .array()
        .optional()
        .describe(
          "Optional list of attachments. Each item is either an absolute file path (regular attachment) or an object { path, inline?, cid? }. To embed an image inline in the body, pass { path, inline: true, cid: 'your-id' } and reference it in the markdown content as ![](cid:your-id). Paths must be absolute; '~/' is expanded. Files up to 150MB each are supported (files larger than 2MB are uploaded via a Graph upload session)."
        ),
      signaturePath: z
        .string()
        .optional()
        .describe(
          "Optional absolute path (or '~/...') to a markdown signature file to append at the bottom of the message. Local image references in the markdown (e.g. ![](logo.png)) are resolved relative to the signature file's directory and embedded as inline CID images automatically. Only include when the user explicitly asks for their signature."
        ),
    },
    async ({ subject, content, recipientEmails, attachments: attachmentInputs, signaturePath }) => {
      try {
        if (!recipientEmails || recipientEmails.length === 0) {
          throw new Error("At least one recipient email address is required.");
        }

        await graphService.sendOutlookMessage(subject, content, recipientEmails, attachmentInputs, signaturePath);

        const attachmentNote = attachmentInputs?.length ? ` with ${attachmentInputs.length} attachment(s)` : "";
        const signatureNote = signaturePath ? " (signature appended)" : "";
        return textToolResult([`Successfully sent Outlook message${attachmentNote}${signatureNote}.`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to send Outlook message.");
      }
    }
  );
};
