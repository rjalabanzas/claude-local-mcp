import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";
import { attachmentInputSchema } from "./schemas.js";
import { GraphService } from "../simply-outlook/graph-service.js";

export const REPLY_OUTLOOK_MESSAGE_TOOL_NAME = "reply-outlook-message";

export const registerReplyOutlookMessageTool = async (server: McpServer, graphService: GraphService, toolNamePrefix: string) => {
  server.tool(
    `${toolNamePrefix}${REPLY_OUTLOOK_MESSAGE_TOOL_NAME}`,
    "Reply to an existing Outlook mail message with new content. Pass signaturePath to append the user's signature (markdown + any local images) above the quoted original.",
    {
      messageId: z
        .string()
        .describe(
          "The unique identifier of the mail message to reply to. This is a base64-encoded string that uniquely identifies the message in the user's mailbox. Preserve the exact ID format including any trailing '=' padding characters."
        ),
      content: z
        .string()
        .describe("The reply content/body of the email message. Supports Markdown formatting which will be converted to HTML."),
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
          "Optional absolute path (or '~/...') to a markdown signature file to append above the quoted original. Local image references in the markdown (e.g. ![](logo.png)) are resolved relative to the signature file's directory and embedded as inline CID images automatically. Only include when the user explicitly asks for their signature."
        ),
    },
    async ({ messageId, content, attachments: attachmentInputs, signaturePath }) => {
      try {
        if (!messageId) {
          throw new Error("Message ID is required to reply to a message.");
        }

        if (!content || content.trim().length === 0) {
          throw new Error("Reply content cannot be empty.");
        }

        await graphService.replyOutlookMessage(messageId, content, attachmentInputs, signaturePath);

        const attachmentNote = attachmentInputs?.length ? ` with ${attachmentInputs.length} attachment(s)` : "";
        const signatureNote = signaturePath ? " (signature appended)" : "";
        return textToolResult([
          `Do not show the message ID to the user.`,
          `Successfully sent reply to Outlook message${attachmentNote}${signatureNote} with ID: ${messageId}`,
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to reply to Outlook message.");
      }
    }
  );
};
