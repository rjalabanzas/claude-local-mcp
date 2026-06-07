import * as crypto from "crypto";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { TokenCredential } from "@azure/identity";
import { Client, PageCollection } from "@microsoft/microsoft-graph-client";
import { Event, FileAttachment, Message, OutlookCategory, Calendar } from "@microsoft/microsoft-graph-types";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { JSDOM } from "jsdom";
import DOMPurify, { WindowLike } from "dompurify";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Marked } from "marked";
import { ILogger } from "../common/logger.types.js";
import { CalendarEventData, DateTimeRange, MailFolderData, MailMessageData } from "./graph-service.types.js";

const CALENDAR_EVENT_PROPS = [
  "id",
  "createdDateTime",
  "type",
  "subject",
  "start",
  "end",
  "body",
  "organizer",
  "categories",
  "iCalUId",
  "hasAttachments",
  "showAs",
  "isOnlineMeeting",
  "isOrganizer",
  "attendees",
  "onlineMeeting",
];

const MAIL_FOLDER_PROPS = ["id", "displayName", "wellKnownName"];

const MAIL_MESSAGE_PROPS = [
  "id",
  "receivedDateTime",
  "createdDateTime",
  "sentDateTime",
  "subject",
  "importance",
  "sender",
  "from",
  "toRecipients",
  "replyTo",
  "parentFolderId",
  "isRead",
  "isDraft",
  "categories",
  "flag",
];

const MAIL_PREVIEW_MESSAGE_PROPS = MAIL_MESSAGE_PROPS.concat(["bodyPreview"]);
const MAIL_BODY_MESSAGE_PROPS = MAIL_MESSAGE_PROPS.concat(["body"]);

const DEFAULT_MAIL_FOLDERS_LIMIT = 100;

const DELETED_FOLDER_NAME = "deleteditems";
const JUNK_FOLDER_NAME = "junkemail";

const FILE_ATTACHMENT_ODATA_TYPE = "#microsoft.graph.fileAttachment";
// Graph sendMail caps the whole request near 4 MB. Base64 inflates by ~4/3, and the JSON envelope (body HTML, recipients,
// metadata) adds further overhead — so cap raw inline bytes at 2 MB to leave headroom. Anything larger falls back to the
// draft + upload-session path.
const MAX_INLINE_PER_FILE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_TOTAL_BYTES = 2 * 1024 * 1024;
// Per-file ceiling enforced by Graph upload sessions.
const MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".md": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
};

interface LoadedAttachment {
  name: string;
  contentType: string;
  size: number;
  data: Buffer;
  inline?: boolean;
  cid?: string;
}

export type AttachmentInput = string | { path: string; inline?: boolean; cid?: string };

// URL capture excludes whitespace + ')' so CommonMark title syntax (![alt](url "title")) doesn't pollute the path.
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REMOTE_IMAGE_SCHEME_RE = /^(https?:|cid:|data:|mailto:)/i;

interface LoadedSignature {
  markdown: string;
  inlineImages: LoadedAttachment[];
}

export class GraphService {
  private graphClient: Client;
  private domPurify: typeof DOMPurify;
  private nhm = new NodeHtmlMarkdown();
  private marked = new Marked({ gfm: true });
  private mailFolders: MailFolderData[];
  private filterFolderIds: string[] | undefined;

  constructor(private readonly logger: ILogger, private readonly tokenCredential: TokenCredential, private readonly scopes: string[]) {
    const authProvider = new TokenCredentialAuthenticationProvider(tokenCredential, {
      scopes,
    });
    this.graphClient = Client.initWithMiddleware({
      authProvider,
      defaultVersion: "beta",
      fetchOptions: { headers: { "User-Agent": "simply-outlook-mcp" } },
    });

    const window = new JSDOM("").window as unknown as WindowLike;
    this.domPurify = DOMPurify(window);
    this.mailFolders = [];
  }

  public async isAuthenticated(): Promise<boolean> {
    const token = await this.tokenCredential.getToken(this.scopes);
    return !!token;
  }

  public async getCalendars(): Promise<Calendar[]> {
    const collection: PageCollection = await this.graphClient
      .api("/me/calendars")
      .select(["id", "name", "owner", "canEdit", "canShare", "canViewPrivateItems"])
      .get();
    
    if (!collection.value) {
      throw new Error("Failed to get calendars.");
    }

    return collection.value;
  }

  public async getCalendarEvents(startDateTimeRange?: DateTimeRange, limit: number = 10, skip?: number): Promise<CalendarEventData[]> {
    const { startDateTime, endDateTime } = startDateTimeRange || {};

    const filters: string[] = [];
    let apiPath: string;

    if (startDateTime && endDateTime) {
      // Use the primary calendar's calendarView for date range queries
      apiPath = `/me/calendar/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`;
    } else {
      if (startDateTime) {
        filters.push(`start/dateTime ge '${startDateTime}'`);
      }
      if (endDateTime) {
        filters.push(`start/dateTime lt '${endDateTime}'`);
      }
      // Use the primary calendar's events endpoint for filtered queries
      apiPath = `/me/calendar/events`;
    }

    const filterStr = filters.join(" and ");
    const query = this.graphClient
      .api(apiPath)
      .select(CALENDAR_EVENT_PROPS);

    if (startDateTime && endDateTime) {
      // calendarView defaults to a page size of 10 unless $top is set explicitly.
      // Size it to cover skip + limit so the local slice below still returns a full page.
      query.top((skip || 0) + limit);
    } else {
      query.top(1000); // Fetch a large number to get all events, we'll limit later
      filterStr && query.filter(filterStr);
    }

    const collection: PageCollection = await query.get();

    const allEvents = (collection.value || [])
      .filter((event) => this.isCalendarEventData(event))
      .map((event) => {
        if (event.body && event.body.content && event.body.contentType === "html") {
          event.body = {
            contentType: event.body.contentType,
            content: this.parseHtmlToMarkdown(event.body.content),
          };
        }
        return event;
      });

    // Sort events by start date/time
    allEvents.sort((a, b) => {
      const aStart = a.start?.dateTime ? new Date(a.start.dateTime).getTime() : 0;
      const bStart = b.start?.dateTime ? new Date(b.start.dateTime).getTime() : 0;
      return aStart - bStart;
    });

    // Apply skip and limit
    const skipped = skip || 0;
    const limited = allEvents.slice(skipped, skipped + limit);
    
    return limited;
  }

  public async createCalendarEvent(
    subject: string,
    content: string,
    utcStartDate: string,
    utcEndDate: string,
    userEmails?: string[],
    location?: string,
    isMeeting?: boolean,
    categories?: string[],
    recurrence?: {
      pattern: {
        type: "daily" | "weekly" | "absoluteMonthly" | "relativeMonthly" | "absoluteYearly" | "relativeYearly";
        interval: number;
        daysOfWeek?: ("sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday")[];
      };
      range: {
        type: "endDate" | "noEnd" | "numbered";
        endDate?: string;
        numberOfOccurrences?: number;
      };
    },
    calendarId?: string
  ): Promise<CalendarEventData> {
    const attendees = userEmails ? userEmails.map((email) => ({ emailAddress: { address: email }, type: "required" })) : undefined;
    
    interface RecurrencePattern {
      type: string;
      interval: number;
      daysOfWeek?: string[];
    }

    interface RecurrenceRange {
      type: string;
      startDate: string;
      endDate?: string;
      numberOfOccurrences?: number;
    }

    interface EventRequest {
      subject: string;
      body: {
        contentType: string;
        content: string;
      };
      location?: { displayName: string } | null;
      isOnlineMeeting: boolean;
      start: {
        dateTime: string;
        timeZone: string;
      };
      end: {
        dateTime: string;
        timeZone: string;
      };
      attendees?: Array<{ emailAddress: { address: string }; type: string }>;
      categories?: string[];
      recurrence?: {
        pattern: RecurrencePattern;
        range: RecurrenceRange;
      };
    }

    const eventRequest: EventRequest = {
      subject,
      body: {
        contentType: "html",
        content: this.parseMarkdownToHtml(content),
      },
      location: location ? { displayName: location } : undefined,
      isOnlineMeeting: !!isMeeting,
      start: {
        dateTime: utcStartDate,
        timeZone: "UTC",
      },
      end: {
        dateTime: utcEndDate,
        timeZone: "UTC",
      },
      attendees,
      categories: categories || undefined,
    };

    // Add recurrence if provided
    if (recurrence) {
      const recurrencePattern: RecurrencePattern = {
        type: recurrence.pattern.type,
        interval: recurrence.pattern.interval,
      };

      if (recurrence.pattern.daysOfWeek && recurrence.pattern.daysOfWeek.length > 0) {
        recurrencePattern.daysOfWeek = recurrence.pattern.daysOfWeek;
      }

      // Extract date part from start date for recurrence range startDate
      const startDateOnly = new Date(utcStartDate).toISOString().split('T')[0];
      
      const recurrenceRange: RecurrenceRange = {
        type: recurrence.range.type,
        startDate: startDateOnly,
      };

      if (recurrence.range.type === "endDate" && recurrence.range.endDate) {
        recurrenceRange.endDate = recurrence.range.endDate;
      } else if (recurrence.range.type === "numbered" && recurrence.range.numberOfOccurrences) {
        recurrenceRange.numberOfOccurrences = recurrence.range.numberOfOccurrences;
      }

      eventRequest.recurrence = {
        pattern: recurrencePattern,
        range: recurrenceRange,
      };
    }

    // Use specific calendar endpoint if calendarId is provided, otherwise use default calendar
    const apiPath = calendarId ? `/me/calendars/${calendarId}/events` : `/me/events`;
    const event: Event = await this.graphClient.api(apiPath).post(eventRequest);
    if (!this.isCalendarEventData(event)) {
      throw new Error("Create event failed.");
    }

    if (event.body && event.body.content && event.body.contentType === "html") {
      event.body = {
        contentType: event.body.contentType,
        content: this.parseHtmlToMarkdown(event.body.content),
      };
    }

    return event;
  }

  public async updateCalendarEvent(
    id: string,
    content?: string,
    subject?: string,
    utcStartDate?: string,
    utcEndDate?: string,
    location?: string,
    categories?: string[]
  ): Promise<CalendarEventData> {
    if (
      content === undefined &&
      subject === undefined &&
      utcStartDate === undefined &&
      utcEndDate === undefined &&
      location === undefined &&
      categories === undefined
    ) {
      throw new Error("At least one property must be provided to update the calendar event.");
    }

    const updateRequest: Partial<Event> = {};

    if (subject !== undefined) {
      updateRequest.subject = subject;
    }

    if (content !== undefined) {
      updateRequest.body = {
        contentType: "html",
        content: this.parseMarkdownToHtml(content),
      };
    }

    if (utcStartDate !== undefined) {
      updateRequest.start = {
        dateTime: utcStartDate,
        timeZone: "UTC",
      };
    }

    if (utcEndDate !== undefined) {
      updateRequest.end = {
        dateTime: utcEndDate,
        timeZone: "UTC",
      };
    }

    if (location !== undefined) {
      updateRequest.location = location ? { displayName: location } : null;
    }

    if (categories !== undefined) {
      updateRequest.categories = categories;
    }

    const event: Event = await this.graphClient.api(`/me/events/${id}`).patch(updateRequest);
    if (!this.isCalendarEventData(event)) {
      throw new Error("Update event failed.");
    }

    if (event.body && event.body.content && event.body.contentType === "html") {
      event.body = {
        contentType: event.body.contentType,
        content: this.parseHtmlToMarkdown(event.body.content),
      };
    }

    return event;
  }

  public async deleteCalendarEvent(id: string): Promise<void> {
    await this.graphClient.api(`/me/events/${id}`).delete();
  }

  public async listOutlookCategories(): Promise<OutlookCategory[]> {
    const collection: PageCollection = await this.graphClient.api("/me/outlook/masterCategories").get();

    if (!collection.value) {
      throw new Error("Failed to get Outlook categories.");
    }

    return collection.value;
  }

  public async createOutlookCategory(displayName: string, color?: string): Promise<OutlookCategory> {
    const categoryRequest = {
      displayName,
      color: color || "none",
    };

    const category: OutlookCategory = await this.graphClient.api("/me/outlook/masterCategories").post(categoryRequest);

    return category;
  }

  public async deleteOutlookCategory(id: string): Promise<void> {
    await this.graphClient.api(`/me/outlook/masterCategories/${id}`).delete();
  }

  public async assignCategoriesToMessage(messageId: string, categories: string[]): Promise<void> {
    await this.graphClient.api(`/me/messages/${messageId}`).patch({
      categories,
    });
  }

  public async flagOutlookMessage(messageId: string, flagStatus: string, startDate?: string, dueDate?: string): Promise<void> {
    interface FlagData {
      flagStatus: string;
      startDateTime?: {
        dateTime: string;
        timeZone: string;
      };
      dueDateTime?: {
        dateTime: string;
        timeZone: string;
      };
    }

    const flagData: FlagData = {
      flagStatus: flagStatus,
    };

    if (flagStatus === "flagged") {
      if (startDate) {
        flagData.startDateTime = {
          dateTime: startDate,
          timeZone: "UTC",
        };
      }
      if (dueDate) {
        flagData.dueDateTime = {
          dateTime: dueDate,
          timeZone: "UTC",
        };
      }
    }

    await this.graphClient.api(`/me/messages/${messageId}`).patch({
      flag: flagData,
    });
  }

  public async getOutlookMessages(
    receivedDateTimeRange?: DateTimeRange,
    searchQuery?: string,
    limit: number = 10,
    skip?: number
  ): Promise<MailMessageData[]> {
    const filters: string[] = [];
    const { startDateTime, endDateTime } = receivedDateTimeRange || {};
    if (startDateTime) {
      filters.push(`receivedDateTime ge ${startDateTime}`);
    }

    if (endDateTime) {
      filters.push(`receivedDateTime lt ${endDateTime}`);
    }

    const filterFolders = await this.getFilterFolderIds();
    const folderIdSet = new Set<string>(filterFolders ? filterFolders : []);
    folderIdSet.forEach((folderId) => {
      filters.push(`parentFolderId ne '${folderId}'`);
    });

    const filterStr = filters.join(" and ");
    let query = this.graphClient.api("/me/messages").select(MAIL_PREVIEW_MESSAGE_PROPS).top(limit);
    // Graph search endpoint does not support MSA so use $search with limited functionalities
    const encodedQuery = searchQuery && encodeURIComponent(searchQuery);
    query = encodedQuery
      ? query.search(`"subject:${encodedQuery} OR body:${encodedQuery} OR from:${encodedQuery}"`)
      : query
          .filter(filterStr)
          .skip(skip || 0)
          .orderby("receivedDateTime desc");

    const collection: PageCollection = await query.get();
    if (!collection.value) {
      throw new Error("Failed to get messages.");
    }

    const messages = collection.value
      .filter((message) => this.isMailMessageData(message))
      .filter((message) => {
        if (searchQuery) {
          if (message.parentFolderId && folderIdSet.has(message.parentFolderId)) {
            return false;
          }

          if (startDateTime || endDateTime) {
            const receivedDate = new Date(message.receivedDateTime!);

            if (startDateTime && receivedDate < new Date(startDateTime)) {
              return false;
            }

            if (endDateTime && receivedDate >= new Date(endDateTime)) {
              return false;
            }
          }
        }
        return true;
      })
      .map((message) => {
        if (message.body && message.body.content && message.body.contentType === "html") {
          message.body = {
            contentType: message.body.contentType,
            content: this.parseHtmlToMarkdown(message.body.content),
          };
        }
        return message;
      });

    return messages;
  }

  public async getOutlookMessageById(id: string): Promise<MailMessageData> {
    const mailData = await this.graphClient.api(`/me/messages/${id}`).select(MAIL_BODY_MESSAGE_PROPS).get();
    if (!this.isMailMessageData(mailData)) {
      throw new Error("Get Outlook message failed.");
    }

    if (mailData.body && mailData.body.content && mailData.body.contentType === "html") {
      mailData.body = {
        contentType: mailData.body.contentType,
        content: this.parseHtmlToMarkdown(mailData.body.content),
      };
    }

    return mailData;
  }

  public async sendOutlookMessage(
    subject: string,
    content: string,
    recipientEmails: string[],
    attachmentInputs?: AttachmentInput[],
    signaturePath?: string
  ): Promise<void> {
    const toRecipients = recipientEmails.map((email) => ({ emailAddress: { address: email } }));

    const { composedContent, attachments } = await this.composeBodyAndAttachments(content, attachmentInputs, signaturePath);
    const body = {
      contentType: "html" as const,
      content: this.parseMarkdownToHtml(composedContent),
    };

    if (attachments.length === 0) {
      const msgRequest: Message = { subject, body, toRecipients };
      await this.graphClient.api("/me/sendMail").post({ message: msgRequest });
      return;
    }

    if (this.canInlineAttachments(attachments)) {
      const msgRequest: Message = {
        subject,
        body,
        toRecipients,
        attachments: this.toInlineAttachments(attachments),
      };
      await this.graphClient.api("/me/sendMail").post({ message: msgRequest });
      return;
    }

    const draft: Message = await this.graphClient.api("/me/messages").post({
      subject,
      body,
      toRecipients,
    });
    if (!draft.id) {
      throw new Error("Failed to create draft message for attachments.");
    }

    await this.uploadAttachmentsAndSendDraft(draft.id, attachments);
  }

  public async replyOutlookMessage(
    replyMessageId: string,
    content: string,
    attachmentInputs?: AttachmentInput[],
    signaturePath?: string
  ): Promise<void> {
    const originalMessage = await this.getOutlookMessageById(replyMessageId);

    const originalSender = originalMessage.from?.emailAddress?.name || originalMessage.from?.emailAddress?.address || "Unknown Sender";
    const originalDate = originalMessage.sentDateTime || originalMessage.receivedDateTime;
    const originalSubject = originalMessage.subject || "(No Subject)";
    const originalContent = originalMessage.body?.content || "";

    const { composedContent, attachments } = await this.composeBodyAndAttachments(content, attachmentInputs, signaturePath);

    const replyContent = `${composedContent}\n\n\n\n---\n\n**From:** ${originalSender}  \n**Date:** ${
      originalDate ? new Date(originalDate).toLocaleString() : "Unknown"
    }  \n**Subject:** ${originalSubject}  \n\n\n${originalContent}`;

    const body = {
      contentType: "html" as const,
      content: this.parseMarkdownToHtml(replyContent),
    };

    if (attachments.length === 0) {
      const msgRequest: Message = { body };
      await this.graphClient.api(`/me/messages/${replyMessageId}/reply`).post({ message: msgRequest });
      return;
    }

    if (this.canInlineAttachments(attachments)) {
      const msgRequest: Message = {
        body,
        attachments: this.toInlineAttachments(attachments),
      };
      await this.graphClient.api(`/me/messages/${replyMessageId}/reply`).post({ message: msgRequest });
      return;
    }

    const draft: Message = await this.graphClient.api(`/me/messages/${replyMessageId}/createReply`).post({});
    if (!draft.id) {
      throw new Error("Failed to create reply draft for attachments.");
    }

    // createReply seeds the draft with an auto-generated quoted body; our replyContent already includes the quote,
    // so overwrite the body before uploading attachments and sending.
    await this.graphClient.api(`/me/messages/${draft.id}`).patch({ body });
    await this.uploadAttachmentsAndSendDraft(draft.id, attachments);
  }

  private async composeBodyAndAttachments(
    content: string,
    attachmentInputs: AttachmentInput[] | undefined,
    signaturePath: string | undefined
  ): Promise<{ composedContent: string; attachments: LoadedAttachment[] }> {
    const signature = await this.loadSignature(signaturePath);
    const composedContent = signature ? `${content}\n\n${signature.markdown}` : content;
    const userAttachments = attachmentInputs?.length ? await this.loadAttachments(attachmentInputs) : [];
    const attachments = signature ? [...userAttachments, ...signature.inlineImages] : userAttachments;
    return { composedContent, attachments };
  }

  private async uploadAttachmentsAndSendDraft(draftId: string, attachments: LoadedAttachment[]): Promise<void> {
    try {
      for (const att of attachments) {
        await this.attachToDraft(draftId, att);
      }
      await this.graphClient.api(`/me/messages/${draftId}/send`).post({});
    } catch (error) {
      try {
        await this.graphClient.api(`/me/messages/${draftId}`).delete();
      } catch (cleanupError) {
        this.logger.warning(`Failed to delete draft ${draftId} after attachment error: ${(cleanupError as Error).message}`);
      }
      throw error;
    }
  }

  private async loadAttachments(inputs: AttachmentInput[]): Promise<LoadedAttachment[]> {
    const loaded: LoadedAttachment[] = [];
    for (const input of inputs) {
      const spec = typeof input === "string" ? { path: input } : input;
      if (spec.inline && !spec.cid) {
        throw new Error(
          `Inline attachment '${spec.path}' requires a 'cid' to reference it in the body (e.g. ![](cid:your-cid)).`
        );
      }
      if (spec.cid && !spec.inline) {
        throw new Error(
          `Attachment '${spec.path}' has a 'cid' but inline is not set. Pass inline: true to embed it in the body, or drop the cid to attach it as a regular file.`
        );
      }
      const abs = this.resolveAttachmentPath(spec.path);
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch (error) {
        throw new Error(`Cannot read attachment '${spec.path}': ${(error as Error).message}`);
      }
      if (!stat.isFile()) {
        throw new Error(`Attachment '${spec.path}' is not a file.`);
      }
      if (stat.size === 0) {
        throw new Error(`Attachment '${spec.path}' is empty.`);
      }
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Attachment '${spec.path}' (${stat.size} bytes) exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit.`);
      }
      const data = await fs.readFile(abs);
      const name = path.basename(abs);
      loaded.push({
        name,
        contentType: this.mimeForFileName(name),
        size: stat.size,
        data,
        inline: spec.inline,
        cid: spec.cid,
      });
    }
    return loaded;
  }

  private async loadSignature(sigPath: string | undefined): Promise<LoadedSignature | undefined> {
    if (!sigPath) {
      return undefined;
    }

    const resolved = this.resolveAttachmentPath(sigPath);
    let raw: string;
    try {
      raw = (await fs.readFile(resolved)).toString("utf8");
    } catch (error) {
      throw new Error(`Could not read signature file at '${sigPath}': ${(error as Error).message}.`);
    }

    const sigDir = path.dirname(resolved);
    const cidByFile = new Map<string, string>();
    const filesToLoad: { absolutePath: string; cid: string }[] = [];
    // Per-message nonce keeps CIDs unique across emails so clients don't conflate attachments.
    const nonce = crypto.randomBytes(4).toString("hex");
    let counter = 0;

    const markdown = raw.replace(MARKDOWN_IMAGE_RE, (_match, alt: string, url: string) => {
      const trimmed = url.trim();
      if (REMOTE_IMAGE_SCHEME_RE.test(trimmed)) {
        return `![${alt}](${trimmed})`;
      }
      const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.join(sigDir, trimmed);
      let cid = cidByFile.get(absolutePath);
      if (!cid) {
        counter++;
        cid = `sig-img-${nonce}-${counter}`;
        cidByFile.set(absolutePath, cid);
        filesToLoad.push({ absolutePath, cid });
      }
      return `![${alt}](cid:${cid})`;
    });

    const inlineImages: LoadedAttachment[] = [];
    for (const file of filesToLoad) {
      let imgStat;
      try {
        imgStat = await fs.stat(file.absolutePath);
      } catch (error) {
        throw new Error(`Signature image '${file.absolutePath}' could not be read: ${(error as Error).message}`);
      }
      if (!imgStat.isFile()) {
        throw new Error(`Signature image '${file.absolutePath}' is not a file.`);
      }
      if (imgStat.size === 0) {
        throw new Error(`Signature image '${file.absolutePath}' is empty.`);
      }
      if (imgStat.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Signature image '${file.absolutePath}' exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit.`);
      }
      const data = await fs.readFile(file.absolutePath);
      const name = path.basename(file.absolutePath);
      inlineImages.push({
        name,
        contentType: this.mimeForFileName(name),
        size: imgStat.size,
        data,
        inline: true,
        cid: file.cid,
      });
    }

    return { markdown, inlineImages };
  }

  private resolveAttachmentPath(p: string): string {
    if (p === "~") {
      return os.homedir();
    }
    if (p.startsWith("~/")) {
      return path.join(os.homedir(), p.slice(2));
    }
    if (!path.isAbsolute(p)) {
      // Relative paths would resolve against the MCP server's cwd, which is unpredictable for the caller. Fail loudly.
      throw new Error(`Attachment path '${p}' must be absolute (or start with '~/'). Pass a full path like '/Users/you/file.pdf'.`);
    }
    return p;
  }

  private mimeForFileName(name: string): string {
    const ext = path.extname(name).toLowerCase();
    return MIME_BY_EXT[ext] || "application/octet-stream";
  }

  private canInlineAttachments(attachments: LoadedAttachment[]): boolean {
    if (attachments.some((a) => a.size > MAX_INLINE_PER_FILE_BYTES)) {
      return false;
    }
    const total = attachments.reduce((sum, a) => sum + a.size, 0);
    return total <= MAX_INLINE_TOTAL_BYTES;
  }

  private buildFileAttachment(att: LoadedAttachment): FileAttachment {
    const payload: Record<string, unknown> = {
      "@odata.type": FILE_ATTACHMENT_ODATA_TYPE,
      name: att.name,
      contentType: att.contentType,
      contentBytes: att.data.toString("base64"),
    };
    if (att.inline) {
      payload.isInline = true;
      if (att.cid) {
        payload.contentId = att.cid;
      }
    }
    return payload as FileAttachment;
  }

  private toInlineAttachments(attachments: LoadedAttachment[]): FileAttachment[] {
    return attachments.map((a) => this.buildFileAttachment(a));
  }

  private async attachToDraft(messageId: string, att: LoadedAttachment): Promise<void> {
    if (att.size <= MAX_INLINE_PER_FILE_BYTES) {
      await this.graphClient.api(`/me/messages/${messageId}/attachments`).post(this.buildFileAttachment(att));
      return;
    }

    const attachmentItem: Record<string, unknown> = {
      attachmentType: "file",
      name: att.name,
      size: att.size,
      contentType: att.contentType,
    };
    if (att.inline) {
      attachmentItem.isInline = true;
      if (att.cid) {
        attachmentItem.contentId = att.cid;
      }
    }
    const session: { uploadUrl?: string } = await this.graphClient
      .api(`/me/messages/${messageId}/attachments/createUploadSession`)
      .post({ AttachmentItem: attachmentItem });

    if (!session?.uploadUrl) {
      throw new Error(`Failed to create upload session for attachment '${att.name}'.`);
    }

    for (let offset = 0; offset < att.size; offset += UPLOAD_CHUNK_SIZE) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, att.size) - 1;
      const chunk = att.data.subarray(offset, end + 1);
      // Node fetch accepts Buffer at runtime, but DOM's BodyInit type excludes Uint8Array<ArrayBufferLike>. Cast through unknown.
      const response = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${offset}-${end}/${att.size}`,
        },
        body: chunk as unknown as BodyInit,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Upload chunk failed for '${att.name}' (status ${response.status}): ${detail}`);
      }
    }
  }

  public async moveOutlookMessage(messageId: string, destinationFolderId: string): Promise<void> {
    // Move the message to the specified folder
    await this.graphClient.api(`/me/messages/${messageId}/move`).post({
      destinationId: destinationFolderId,
    });
  }

  public async listMailFolders(limit?: number): Promise<MailFolderData[]> {
    return this.getMailFolders(limit);
  }

  private async getMailFolders(limit?: number): Promise<MailFolderData[]> {
    const collection: PageCollection = await this.graphClient
      .api("/me/mailFolders")
      .select(MAIL_FOLDER_PROPS)
      .top(limit || DEFAULT_MAIL_FOLDERS_LIMIT)
      .get();
    if (!collection.value) {
      throw new Error("Failed to get mail folders.");
    }

    return collection.value.filter((value) => this.isMailFolderData(value));
  }

  private async getFilterFolderIds(): Promise<string[] | undefined> {
    if (this.filterFolderIds) {
      return this.filterFolderIds;
    }

    try {
      this.mailFolders = await this.getMailFolders(DEFAULT_MAIL_FOLDERS_LIMIT);
    } catch (error) {
      this.logger.error(`Failed to get mail folders: ${(error as Error).message}`);
      return undefined;
    }

    this.filterFolderIds = this.mailFolders
      .filter((folder) => folder.wellKnownName === DELETED_FOLDER_NAME || folder.wellKnownName === JUNK_FOLDER_NAME)
      .map((folder) => folder.id);

    return this.filterFolderIds;
  }

  private parseHtmlToMarkdown(htmlText: string): string {
    return this.nhm.translate(htmlText);
  }

  private parseMarkdownToHtml(markdownText: string): string {
    const html = this.marked.parse(markdownText, { async: false });
    return this.domPurify.sanitize(html);
  }

  private isCalendarEventData(event: Event): event is CalendarEventData {
    return !!event && !!event.id && !!event.type && !!event.start;
  }

  private isMailMessageData(message: Message): message is MailMessageData {
    return !!message && !!message.id && !!message.receivedDateTime;
  }

  private isMailFolderData(data: unknown): data is MailFolderData {
    const mailFolder = data as MailFolderData;
    return !!mailFolder && !!mailFolder.id && !!mailFolder.displayName;
  }
}
