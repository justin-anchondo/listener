import { speakingPatterns } from "@/lib/assist/coaching";
import { transcriptLines } from "@/lib/assist/prompt";
import { talkStats } from "@/lib/assist/stats";
import type { Config } from "@/lib/config";
import { auditToolCall } from "@/lib/db/connector";
import { listDirectory } from "@/lib/db/directory";
import { NotFoundError } from "@/lib/db/keyring";
import { getMeetingMeta, latestSummary, listMeetingItems, listProjectMeetings, loadMeetingContext } from "@/lib/db/summaries";
import { OAuthError, type ToolArgs, cleanToolCall } from "@/lib/policy/connector";

// The Model Context Protocol server Claude talks to (SPEC 6.6): JSON-RPC over
// Streamable HTTP, JSON responses only. Read only. Every tool that touches
// client data takes one client_id and reads through that client's scope.

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const clientArg = { client_id: { type: "string", description: "Client id from list_clients" } };
const meetingArgs = { ...clientArg, meeting_id: { type: "string", description: "Meeting id from list_meetings" } };
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const TOOLS = [
  {
    name: "list_clients",
    description: "List the owner's clients and their projects (names and ids). Start here.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List clients", ...readOnly },
  },
  {
    name: "list_meetings",
    description: "List one client's meetings, newest first: date, length, title, tags, open items, and whether the transcript is still available (transcripts are deleted 30 days after a meeting).",
    inputSchema: {
      type: "object",
      properties: { ...clientArg, project_id: { type: "string", description: "Optional project id to narrow the list" }, limit: { type: "integer", minimum: 1 } },
      required: ["client_id"],
      additionalProperties: false,
    },
    annotations: { title: "List meetings", ...readOnly },
  },
  {
    name: "get_summary",
    description: "One meeting's latest summary: purpose, main points, decisions, key quotes, feedback, and the owner's action items.",
    inputSchema: { type: "object", properties: meetingArgs, required: ["client_id", "meeting_id"], additionalProperties: false },
    annotations: { title: "Get meeting summary", ...readOnly },
  },
  {
    name: "get_transcript",
    description: "One meeting's full transcript with speaker names and timestamps. The owner is labeled \"Me\" once speakers are named.",
    inputSchema: { type: "object", properties: meetingArgs, required: ["client_id", "meeting_id"], additionalProperties: false },
    annotations: { title: "Get transcript", ...readOnly },
  },
  {
    name: "get_speaking_stats",
    description: "Speaking patterns per speaker for coaching: talk share, words per minute, turns, longest monologue, questions asked, filler words, and cut-ins.",
    inputSchema: { type: "object", properties: meetingArgs, required: ["client_id", "meeting_id"], additionalProperties: false },
    annotations: { title: "Get speaking stats", ...readOnly },
  },
];

const INSTRUCTIONS = [
  "Listener holds the owner's recorded client meetings. Data is read only.",
  "Call list_clients first, then list_meetings for one client, then get_summary, get_transcript, or get_speaking_stats for a meeting.",
  "Every call reads one client. The owner appears as \"Me\" in transcripts once speakers are named.",
  "Transcripts are deleted 30 days after a meeting; summaries stay.",
].join(" ");

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Runs one validated tool call. Returns plain data for the model. */
export async function runTool(config: Config, call: ToolArgs): Promise<unknown> {
  switch (call.tool) {
    case "list_clients":
      return (await listDirectory()).map((c) => ({
        client_id: c.id,
        name: c.name,
        projects: c.projects.map((p) => ({ project_id: p.id, name: p.name, status: p.status })),
      }));
    case "list_meetings": {
      const client = (await listDirectory()).find((c) => c.id === call.clientId);
      if (!client) throw new NotFoundError("client");
      const projects = client.projects.filter((p) => !call.projectId || p.id === call.projectId);
      if (call.projectId && projects.length === 0) throw new NotFoundError("project");
      const all = (await Promise.all(projects.map(async (p) => (await listProjectMeetings(call.clientId, p.id)).map((m) => ({ ...m, project: p })))))
        .flat()
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, call.limit);
      return all.map((m) => ({
        meeting_id: m.id,
        project_id: m.project.id,
        project: m.project.name,
        started_at: iso(m.startedAt),
        minutes: m.endedAt ? Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 60_000) : null,
        title: m.title,
        tags: m.tags,
        open_items: m.openItems,
        transcript_available_until: iso(m.transcriptExpiresAt),
      }));
    }
    case "get_summary": {
      const [meta, summary, items] = await Promise.all([
        getMeetingMeta(call.clientId, call.meetingId),
        latestSummary(call.clientId, call.meetingId),
        listMeetingItems(call.clientId, call.meetingId),
      ]);
      return {
        meeting_id: call.meetingId,
        started_at: iso(meta.startedAt),
        ended_at: iso(meta.endedAt),
        summary: summary ? { ...summary.content, tags: summary.tags, version: summary.version } : null,
        action_items: items.map((i) => ({ title: i.title, owner: i.owner, due_date: i.dueDate, status: i.status })),
      };
    }
    case "get_transcript": {
      const ctx = await loadMeetingContext(call.clientId, call.meetingId);
      const lines = transcriptLines(ctx.segments, ctx.speakerMap, config.capture.merge_gap_seconds * 1000);
      return {
        meeting_id: call.meetingId,
        client: ctx.clientName,
        project: ctx.projectName,
        started_at: iso(ctx.startedAt),
        speakers_named: Object.keys(ctx.speakerMap).length > 0,
        transcript: lines.length ? lines.map((l) => `[${clock(l.startMs)}] ${l.speaker}: ${l.text}`).join("\n") : "(no transcript: it may have expired)",
      };
    }
    case "get_speaking_stats": {
      const ctx = await loadMeetingContext(call.clientId, call.meetingId);
      return {
        meeting_id: call.meetingId,
        started_at: iso(ctx.startedAt),
        total_minutes: Math.round(talkStats(ctx.segments, ctx.speakerMap).totalMs / 60_000),
        speakers: speakingPatterns(ctx.segments, ctx.speakerMap, config.connector.filler_words),
        note: ctx.segments.length ? undefined : "No transcript: it may have expired.",
      };
    }
  }
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type RpcReply = { jsonrpc: "2.0"; id: unknown; result?: unknown; error?: { code: number; message: string } };

const reply = (id: unknown, result: unknown): RpcReply => ({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string): RpcReply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/**
 * Handles one JSON-RPC message. Notifications get no reply (null). Tool
 * errors are returned as tool results with isError, with a short code only:
 * nothing from the transcript or the database goes into an error.
 */
export async function handleRpc(msg: Rpc, ctx: { config: Config; grantId: string; run?: typeof runTool }): Promise<RpcReply | null> {
  if (typeof msg !== "object" || msg === null || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
  const isNotification = !("id" in msg);
  const params = (typeof msg.params === "object" && msg.params !== null ? msg.params : {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return reply(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "listener", title: "Listener meetings", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return isNotification ? null : reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: TOOLS });
    case "tools/call": {
      let call: ToolArgs;
      try {
        call = cleanToolCall(params.name, params.arguments, ctx.config.connector.max_meetings_per_list);
      } catch {
        return fail(msg.id, -32602, "Unknown tool or invalid arguments");
      }
      try {
        const data = await (ctx.run ?? runTool)(ctx.config, call);
        await auditToolCall(call.tool, ctx.grantId, "clientId" in call ? call.clientId : null, "meetingId" in call ? call.meetingId : null);
        return reply(msg.id, { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], isError: false });
      } catch (err) {
        const code = err instanceof NotFoundError ? "not_found" : err instanceof OAuthError ? "invalid_arguments" : "server_error";
        if (code === "server_error") throw err;
        return reply(msg.id, { content: [{ type: "text", text: `Error: ${code}. Check the ids with list_clients and list_meetings.` }], isError: true });
      }
    }
    default:
      if (isNotification || msg.method.startsWith("notifications/")) return null;
      return fail(msg.id, -32601, "Method not found");
  }
}
