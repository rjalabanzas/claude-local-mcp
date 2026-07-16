#!/usr/bin/env node
// pa-semper — MCP server for a Semper PMS, via the IntegrationsAPI.
// Read-only: in-house, arrivals, reservations-in-period, day-ends, availability, raw GET.
//
// Two gotchas carried over from the original semper.py skill:
//   1. Semper's auth headers are CASE-SENSITIVE and must be lowercase
//      (x-channel / x-api-key / x-token). Python urllib capitalized them -> HTTP 500.
//      Node's fetch sends header names as given, so lowercase here is exactly right.
//   2. The API key can contain '#'. It arrives via env (extension config), never a shell
//      `source`, so nothing truncates at '#'.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.SEMPER_BASE_URL ||
  "https://iis-prod.semper-services.com/IntegrationsAPI/").replace(/\/?$/, "/");
const VENUE = process.env.SEMPER_VENUE_ID || "";
const CHANNEL = process.env.SEMPER_X_CHANNEL || "";
const API_KEY = process.env.SEMPER_X_API_KEY || "";
const TOKEN = process.env.SEMPER_X_TOKEN || "";

function usDate(iso) {
  // YYYY-MM-DD -> MM/DD/YYYY (Semper's expected format)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) throw new Error(`date must be YYYY-MM-DD, got: ${iso}`);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function semperGet(path) {
  if (!CHANNEL || !API_KEY || !TOKEN) {
    throw new Error(
      "Semper credentials missing — set the x-channel / x-api-key / x-token values in the extension's configuration."
    );
  }
  const res = await fetch(BASE_URL + path, {
    method: "GET",
    headers: { "x-channel": CHANNEL, "x-api-key": API_KEY, "x-token": TOKEN },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Semper HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const TOOLS = [
  {
    name: "inhouse",
    description:
      "Guests currently in-house at the property (checked in, not yet departed).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "arriving",
    description:
      "Reservations arriving between two dates (defaults to today..today). Dates YYYY-MM-DD, inclusive.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "YYYY-MM-DD; defaults to today" },
        endDate: { type: "string", description: "YYYY-MM-DD; defaults to startDate" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "period",
    description:
      "Reservations overlapping a date period. Dates YYYY-MM-DD, inclusive.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
  },
  {
    name: "dayends",
    description: "Day-end records for the venue.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "availability",
    description:
      "Room availability between two dates. Dates YYYY-MM-DD, inclusive. Optional roomTypeID (0 = all types).",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        roomTypeID: { type: "string", description: "Room type ID; 0 or omit for all" },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
  },
  {
    name: "raw",
    description:
      "Advanced read-only escape hatch: raw GET against the IntegrationsAPI. Provide the path after the base URL, e.g. 'OpenAPI/Reservations/PMSInHouse?pVenueID=<your-venue-id>'.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path after the base URL, including any query string",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

function buildPath(name, args) {
  switch (name) {
    case "inhouse":
      return `OpenAPI/Reservations/PMSInHouse?pVenueID=${VENUE}`;
    case "arriving": {
      const start = args.startDate || today();
      const end = args.endDate || start;
      return `OpenAPI/Reservations/PMSArriving?pVenueID=${VENUE}&pStartDate=${usDate(
        start
      )}&pEndDate=${usDate(end)}`;
    }
    case "period":
      return `OpenAPI/Reservations/PMSReservationsInPeriod?pVenueID=${VENUE}&pStartDate=${usDate(
        args.startDate
      )}&pEndDate=${usDate(args.endDate)}`;
    case "dayends":
      return `OpenAPI/Venues/PMSDayEnds?pVenueID=${VENUE}`;
    case "availability": {
      const rt =
        args.roomTypeID != null && args.roomTypeID !== "" ? args.roomTypeID : "0";
      return `OpenAPI/Rooms/PMSAvailable?pVenueID=${VENUE}&pStartDate=${usDate(
        args.startDate
      )}&pEndDate=${usDate(args.endDate)}&pRoomTypeID=${rt}`;
    }
    case "raw":
      return String(args.path || "").replace(/^\//, "");
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: "pa-semper", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const data = await semperGet(buildPath(name, args));
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
