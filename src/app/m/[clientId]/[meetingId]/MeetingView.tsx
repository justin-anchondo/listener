"use client";

import { useCallback, useEffect, useState } from "react";
import type { SummaryContentT } from "@/lib/assist/schema";
import type { TalkStats } from "@/lib/assist/stats";
import { clock, daysUntil, fmtDateTime, minutesBetween } from "@/lib/format";

type Item = {
  id: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  status: "open" | "done";
  sourceQuote: string | null;
  sourceMs: number | null;
};

type Summary = {
  version: number;
  source: "model" | "edit";
  tags: string[];
  createdAt: string;
  content: SummaryContentT & { stats?: TalkStats };
};

type Data = {
  meeting: {
    clientName: string;
    projectId: string;
    projectName: string;
    template: string;
    startedAt: string;
    endedAt: string | null;
    transcriptExpiresAt: string | null;
  };
  speakerMap: Record<string, string>;
  speakers: number[];
  transcript: { speaker: number | null; startMs: number; text: string }[];
  summary: Summary | null;
  items: Item[];
};

const GENERATE_ERRORS: Record<string, string> = {
  empty: "This meeting has no saved transcript to summarize.",
  not_configured: "The server is missing its Anthropic API key (ANTHROPIC_API_KEY).",
  refused: "The model declined to summarize this transcript.",
  rate_limited: "Too many requests right now. Try again in a minute.",
  truncated: "The summary came back incomplete. Try again.",
  invalid: "The summary came back malformed. Try again.",
  upstream: "The model service had a problem. Try again shortly.",
};

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="block">
      <h3>{title}</h3>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </section>
  );
}

export default function MeetingView({ clientId, meetingId, allowedTags }: { clientId: string; meetingId: string; allowedTags: string[] }) {
  const base = `/api/clients/${clientId}/meetings/${meetingId}`;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" });
    if (res.status === 401) return window.location.assign("/");
    if (!res.ok) return setError(res.status === 404 ? "Meeting not found." : "Couldn't load this meeting.");
    setData(await res.json());
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await send(`${base}/summary`, "POST", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setGenerating(false);
    if (!res.ok) {
      const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
      return setError(GENERATE_ERRORS[code ?? ""] ?? "Couldn't generate the summary.");
    }
    await load();
  }

  async function itemAction(item: Item, body: Partial<Item>) {
    // Show the change right away; the reload below reconciles with the server.
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...body } : i)) });
    const res = await send(`/api/clients/${clientId}/action-items/${item.id}`, "PATCH", body);
    if (!res.ok) setError("Couldn't update the action item.");
    await load();
  }

  async function removeItem(item: Item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await send(`/api/clients/${clientId}/action-items/${item.id}`, "DELETE");
    await load();
  }

  async function addItem() {
    const title = window.prompt("New action item")?.trim();
    if (!title) return;
    const res = await send(`${base}/action-items`, "POST", { title, owner: "Me" });
    if (!res.ok) setError("Couldn't add the action item.");
    await load();
  }

  if (error && !data) return <main className="page"><p className="error pad">{error}</p></main>;
  if (!data) return <main className="page"><p className="muted pad">Loading…</p></main>;

  const { meeting, summary, items } = data;
  const s = summary?.content;
  const minutes = minutesBetween(meeting.startedAt, meeting.endedAt);
  const label = (sp: number | null) => (sp === null ? "Speaker" : data.speakerMap[String(sp)] || `Speaker ${sp + 1}`);
  const daysLeft = meeting.transcriptExpiresAt ? daysUntil(meeting.transcriptExpiresAt) : null;

  return (
    <main className="page">
      <header className="bar">
        <a className="link" href={`/p/${clientId}/${meeting.projectId}`}>‹ Meetings</a>
        <span className="label grow">{s?.title ?? "Meeting"}</span>
        <a className="link" href="/">Record</a>
      </header>

      <p className="meta pad">
        {meeting.clientName} · {meeting.projectName} · {fmtDateTime(meeting.startedAt)}
        {minutes ? ` · ${minutes} min` : ""} · {meeting.template.replace(/_/g, " ")}
      </p>
      {error && <p className="error pad" role="alert">{error}</p>}

      {!summary && (
        <section className="block">
          <p className="muted">No summary yet.</p>
          <button onClick={generate} disabled={generating || data.transcript.length === 0}>
            {generating ? "Summarizing… (up to a minute)" : "Generate summary"}
          </button>
        </section>
      )}

      {summary && s && editing && (
        <EditSummary
          summary={summary}
          allowedTags={allowedTags}
          onCancel={() => setEditing(false)}
          onSave={async (content, tags) => {
            const res = await send(`${base}/summary`, "PUT", { content, tags });
            if (!res.ok) return setError("Couldn't save your edits.");
            setEditing(false);
            await load();
          }}
        />
      )}

      {summary && s && !editing && (
        <>
          <section className="block">
            {s.purpose && <p className="purpose">{s.purpose}</p>}
            {s.summary.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
            {(summary.tags.length > 0 || s.free_tags.length > 0) && (
              <p className="tags">{[...summary.tags, ...s.free_tags].map((t) => <span key={t} className="tag">{t.replace(/_/g, " ")}</span>)}</p>
            )}
          </section>
          <List title="Main points" items={s.main_points} />
          <List title="Decisions" items={s.decisions} />
        </>
      )}

      <section className="block">
        <div className="row">
          <h3>Action items</h3>
          <button className="link" onClick={addItem}>+ Add</button>
        </div>
        {items.length === 0 && <p className="muted">None.</p>}
        <ul className="items">
          {items.map((item) => (
            <li key={item.id} className={item.status}>
              <input
                type="checkbox"
                checked={item.status === "done"}
                aria-label={`Mark "${item.title}" ${item.status === "done" ? "open" : "done"}`}
                onChange={() => itemAction(item, { status: item.status === "done" ? "open" : "done" })}
              />
              <div className="item-body">
                <button className="item-title" onClick={() => {
                  const title = window.prompt("Action item", item.title)?.trim();
                  if (title && title !== item.title) void itemAction(item, { title });
                }}>{item.title}</button>
                <div className="item-meta">
                  <button className="link small-text" onClick={() => {
                    const owner = window.prompt("Owner (Me, or a name)", item.owner ?? "");
                    if (owner !== null) void itemAction(item, { owner: owner.trim() || null });
                  }}>{item.owner ?? "No owner"}</button>
                  <input
                    type="date"
                    value={item.dueDate ?? ""}
                    aria-label="Due date"
                    onChange={(e) => itemAction(item, { dueDate: e.target.value || null })}
                  />
                  {item.sourceMs !== null && <span className="muted">said at {clock(item.sourceMs / 1000)}</span>}
                  <button className="link danger small-text" onClick={() => removeItem(item)}>Delete</button>
                </div>
                {item.sourceQuote && <q className="muted">{item.sourceQuote}</q>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {s && !editing && (
        <>
          <section className="block">
            <h3>Feedback for you</h3>
            {s.stats && s.stats.speakers.length > 0 && (
              <div className="talk">
                {s.stats.speakers.map((sp) => (
                  <div key={sp.label} className="talk-row">
                    <span>{sp.label}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(sp.share * 100)}%` }} /></span>
                    <span className="muted">{Math.round(sp.share * 100)}% · {sp.questions} q</span>
                  </div>
                ))}
                {!s.stats.me && <p className="muted small-text">Name yourself &quot;Me&quot; under Speakers, then regenerate, for feedback on your own talk time.</p>}
              </div>
            )}
          </section>
          <List title="What went well" items={s.feedback.went_well} />
          <List title="Try next time" items={s.feedback.suggestions} />
          <List title="Didn't come up" items={s.feedback.not_covered} />
          <List title="You committed to" items={s.feedback.commitments_by_me} />
          <List title="Open questions" items={s.feedback.open_questions} />
          {s.key_quotes.length > 0 && (
            <section className="block">
              <h3>Key quotes</h3>
              {s.key_quotes.map((q, i) => (
                <blockquote key={i}>
                  “{q.quote}”<cite>{q.speaker} · {clock(q.at_ms / 1000)}</cite>
                </blockquote>
              ))}
            </section>
          )}
        </>
      )}

      {data.speakers.length > 0 && (
        <Speakers
          speakers={data.speakers}
          map={data.speakerMap}
          onSave={async (map) => {
            const res = await send(`${base}/speakers`, "PUT", { map });
            if (!res.ok) return setError("Couldn't save speaker names.");
            await load();
          }}
        />
      )}

      {data.transcript.length > 0 && (
        <details className="block transcript-block">
          <summary>
            Transcript{daysLeft !== null && <span className="muted"> · deleted in {Math.max(0, daysLeft)} days</span>}
          </summary>
          {data.transcript.map((t, i) => (
            <p key={i} className="seg">
              <span className="who">{label(t.speaker)}</span>
              <span className="at">{clock(t.startMs / 1000)}</span>
              <span className="text">{t.text}</span>
            </p>
          ))}
        </details>
      )}
      {data.transcript.length === 0 && summary && <p className="muted pad small-text">The full transcript has been deleted. The summary is kept.</p>}

      {summary && !editing && (
        <footer className="block actions-row">
          <button className="secondary" onClick={() => setEditing(true)}>Edit summary</button>
          {data.transcript.length > 0 && (
            <button className="secondary" disabled={generating} onClick={() => {
              if (window.confirm("Regenerate the summary? Your edited and completed action items are kept.")) void generate();
            }}>{generating ? "Summarizing…" : "Regenerate"}</button>
          )}
          <span className="muted small-text">
            Version {summary.version} · {summary.source === "edit" ? "edited by you" : "generated"} · {fmtDateTime(summary.createdAt)}
          </span>
        </footer>
      )}
    </main>
  );
}

function Speakers({ speakers, map, onSave }: { speakers: number[]; map: Record<string, string>; onSave: (m: Record<string, string>) => Promise<void> }) {
  const [names, setNames] = useState<Record<string, string>>(map);
  const me = Object.entries(names).find(([, n]) => n === "Me")?.[0] ?? "";
  const dirty = JSON.stringify(names) !== JSON.stringify(map);
  return (
    <section className="block">
      <h3>Speakers</h3>
      <p className="muted small-text">Labels are per meeting. No voice profiles are kept.</p>
      {speakers.map((sp) => {
        const key = String(sp);
        return (
          <div key={sp} className="speaker-row">
            <span className="muted">Speaker {sp + 1}</span>
            <input
              value={names[key] === "Me" ? "" : (names[key] ?? "")}
              placeholder={names[key] === "Me" ? "Me" : "Name"}
              disabled={names[key] === "Me"}
              onChange={(e) => setNames({ ...names, [key]: e.target.value })}
            />
            <label className="me-pick">
              <input
                type="radio"
                name="me"
                checked={me === key}
                onChange={() => {
                  const next = Object.fromEntries(Object.entries(names).filter(([, n]) => n !== "Me"));
                  setNames({ ...next, [key]: "Me" });
                }}
              />
              Me
            </label>
          </div>
        );
      })}
      {dirty && <button onClick={() => onSave(names)}>Save names</button>}
    </section>
  );
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function EditSummary({
  summary,
  allowedTags,
  onSave,
  onCancel,
}: {
  summary: Summary;
  allowedTags: string[];
  onSave: (c: SummaryContentT, tags: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const c = summary.content;
  const [f, setF] = useState({
    title: c.title,
    purpose: c.purpose,
    summary: c.summary,
    main_points: c.main_points.join("\n"),
    decisions: c.decisions.join("\n"),
    went_well: c.feedback.went_well.join("\n"),
    suggestions: c.feedback.suggestions.join("\n"),
    not_covered: c.feedback.not_covered.join("\n"),
    commitments_by_me: c.feedback.commitments_by_me.join("\n"),
    open_questions: c.feedback.open_questions.join("\n"),
  });
  const [tags, setTags] = useState<string[]>(summary.tags);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof f, label: string, rows = 3) => (
    <label className="edit-field">
      <span>{label}</span>
      {rows === 1
        ? <input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
        : <textarea rows={rows} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />}
    </label>
  );

  return (
    <section className="block edit">
      {field("title", "Title", 1)}
      {field("purpose", "Purpose", 2)}
      {field("summary", "Summary", 6)}
      <p className="muted small-text">Lists: one entry per line.</p>
      {field("main_points", "Main points", 4)}
      {field("decisions", "Decisions", 3)}
      {field("went_well", "What went well")}
      {field("suggestions", "Try next time")}
      {field("not_covered", "Didn't come up")}
      {field("commitments_by_me", "You committed to")}
      {field("open_questions", "Open questions")}
      <div className="tag-pick">
        {allowedTags.map((t) => (
          <label key={t}>
            <input type="checkbox" checked={tags.includes(t)} onChange={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
            {t.replace(/_/g, " ")}
          </label>
        ))}
      </div>
      <div className="actions-row">
        <button disabled={saving || !f.title.trim()} onClick={async () => {
          setSaving(true);
          await onSave({
            title: f.title.trim(),
            purpose: f.purpose,
            summary: f.summary,
            main_points: lines(f.main_points),
            decisions: lines(f.decisions),
            key_quotes: c.key_quotes,
            feedback: {
              went_well: lines(f.went_well),
              suggestions: lines(f.suggestions),
              not_covered: lines(f.not_covered),
              commitments_by_me: lines(f.commitments_by_me),
              open_questions: lines(f.open_questions),
            },
            free_tags: c.free_tags,
          }, tags);
          setSaving(false);
        }}>{saving ? "Saving…" : "Save as new version"}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
