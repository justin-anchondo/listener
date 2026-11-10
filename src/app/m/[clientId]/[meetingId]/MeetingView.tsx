"use client";

import { SkeletonBlock } from "@/components/ui/skeleton";
import { cachedFetch, peek } from "@/lib/client/cache";
import { Merge, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type ItemPatch, ItemRow, ItemSheet, type SheetItem, useUndoDelete } from "@/components/app/items";
import { MergeSheet } from "@/components/app/merge-sheet";
import { PageHeader } from "@/components/app/page-header";
import { useWideScreen } from "@/lib/client/media";
import { isMyTask } from "@/lib/owner";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SummaryContentT } from "@/lib/assist/schema";
import type { TalkStats } from "@/lib/assist/stats";
import { sendJson } from "@/lib/client/directory";
import { clock, daysUntil, fmtDateTime, minutesBetween } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  briefUpdates: { id: string; text: string; dismissed: boolean }[];
};

type Tab = "summary" | "actions" | "feedback" | "transcript";

const GENERATE_ERRORS: Record<string, string> = {
  empty: "This meeting has no saved transcript to summarize.",
  not_configured: "The server is missing its Anthropic API key (ANTHROPIC_API_KEY).",
  refused: "The model declined to summarize this transcript.",
  rate_limited: "Too many requests right now. Try again in a minute.",
  truncated: "The summary came back incomplete. Try again.",
  invalid: "The summary came back malformed. Try again.",
  upstream: "The model service had a problem. Try again shortly.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
          <span className="text-link" aria-hidden="true">•</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MeetingView({ clientId, meetingId, allowedTags, ownerNames, onlyMine }: {
  clientId: string; meetingId: string; allowedTags: string[]; ownerNames: string[]; onlyMine: boolean;
}) {
  const base = `/api/clients/${clientId}/meetings/${meetingId}`;
  const [data, setData] = useState<Data | null>(() => peek<Data>(`/api/clients/${clientId}/meetings/${meetingId}`) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [merging, setMerging] = useState(false);
  const wide = useWideScreen();
  useEffect(() => {
    if (wide && tab === "actions") setTab("summary");
  }, [wide, tab]);
  const [pinned, setPinned] = useState<{ id: string; kind: string; text: string }[]>([]);

  useEffect(() => {
    void fetch(`/api/clients/${clientId}/meetings/${meetingId}/suggestions?pinned=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((b: { suggestions: { id: string; kind: string; text: string }[] }) => setPinned(b.suggestions))
      .catch(() => undefined);
  }, [clientId, meetingId]);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const load = useCallback(async () => {
    const res = await cachedFetch(base);
    if (res.status === 401) return window.location.assign("/");
    if (!res.ok) return setError(res.status === 404 ? "Meeting not found." : "Couldn't load this meeting.");
    setData(await res.json());
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const undoDelete = useUndoDelete<Item>(async (item, reason) => {
    const res = await sendJson(`/api/clients/${clientId}/action-items/${item.id}${reason ? `?reason=${reason}` : ""}`, "DELETE");
    if (!res.ok && res.status !== 404) setError("Couldn't delete the action item.");
    await load();
  });

  async function generate() {
    setGenerating(true);
    setConfirmRegen(false);
    setError(null);
    const res = await sendJson(`${base}/summary`, "POST", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setGenerating(false);
    if (!res.ok) {
      const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
      return setError(GENERATE_ERRORS[code ?? ""] ?? "Couldn't generate the summary.");
    }
    await load();
  }

  async function patchItem(item: Item, body: ItemPatch & { status?: "open" | "done" }) {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...body } : i)) });
    const res = await sendJson(`/api/clients/${clientId}/action-items/${item.id}`, "PATCH", body);
    if (!res.ok) setError("Couldn't update the action item.");
    await load();
  }

  async function addItem() {
    const res = await sendJson(`${base}/action-items`, "POST", { title: "New action item", owner: "Me" });
    if (!res.ok) return setError("Couldn't add the action item.");
    const { id } = (await res.json()) as { id: string };
    await load();
    setOpenItem({ id, title: "New action item", owner: "Me", dueDate: null, status: "open", sourceQuote: null, sourceMs: null });
  }

  if (error && !data) return <main className="px-5 pt-safe"><p className="pt-10 text-destructive">{error}</p></main>;
  if (!data) {
    return (
      <main aria-busy="true" className="flex flex-col gap-4 px-5 pt-safe">
        <SkeletonBlock className="mt-14 h-4 w-28" />
        <SkeletonBlock className="h-8 w-4/5" />
        <SkeletonBlock className="h-3.5 w-1/2" />
        <SkeletonBlock className="mt-2 h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-11/12" />
        <SkeletonBlock className="h-4 w-3/4" />
      </main>
    );
  }

  const { meeting, summary } = data;
  const visible = data.items.filter((i) => i.id !== undoDelete.hiddenId);
  // Only the owner's tasks are listed; tasks for other people from older summaries sit behind a toggle.
  const items = onlyMine ? visible.filter((i) => isMyTask(i.owner, ownerNames)) : visible;
  const othersItems = onlyMine ? visible.filter((i) => !isMyTask(i.owner, ownerNames)) : [];
  const s = summary?.content;
  const minutes = minutesBetween(meeting.startedAt, meeting.endedAt);
  const label = (sp: number | null) => (sp === null ? "Speaker" : data.speakerMap[String(sp)] || `Speaker ${sp + 1}`);
  const daysLeft = meeting.transcriptExpiresAt ? Math.max(0, daysUntil(meeting.transcriptExpiresAt)) : null;
  const openCount = items.filter((i) => i.status === "open").length;

  const sheetItem: SheetItem | null = openItem && {
    id: openItem.id,
    title: openItem.title,
    owner: openItem.owner,
    dueDate: openItem.dueDate,
    sourceQuote: openItem.sourceQuote,
    context: openItem.sourceMs !== null ? `Said at ${clock(openItem.sourceMs / 1000)}` : undefined,
  };

  const actionsSection = (
          <section className="flex flex-col">
            {items.length === 0 && <p className="text-[15px] text-muted-foreground">No action items.</p>}
            <ul>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={{
                    id: item.id,
                    title: item.title,
                    sub: [item.owner ?? "No owner", item.sourceMs !== null ? `said at ${clock(item.sourceMs / 1000)}` : null].filter(Boolean).join(" · "),
                    dueDate: item.dueDate,
                    done: item.status === "done",
                  }}
                  onToggle={() => patchItem(item, { status: item.status === "done" ? "open" : "done" })}
                  onDue={(date) => patchItem(item, { dueDate: date })}
                  onOpen={() => setOpenItem(item)}
                  onDelete={() => undoDelete.remove(item)}
                />
              ))}
            </ul>
            {items.length > 0 && <p className="mt-3 text-xs text-muted-foreground [@media(pointer:fine)]:hidden">Swipe left to delete · hold to edit</p>}
            <button type="button" onClick={addItem} className="mt-2 flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-link">
              <Plus className="size-4" aria-hidden="true" /> Add action item
            </button>
            {othersItems.length > 0 && (
              <details className="mt-4 rounded-xl bg-surface px-4 py-2">
                <summary className="min-h-10 cursor-pointer py-2 text-[13px] text-muted-foreground">
                  {othersItems.length} {othersItems.length === 1 ? "task" : "tasks"} for other people, from before tasks were limited to yours
                </summary>
                <ul>
                  {othersItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={{ id: item.id, title: item.title, sub: item.owner ?? "No owner", dueDate: item.dueDate, done: item.status === "done" }}
                      onToggle={() => patchItem(item, { status: item.status === "done" ? "open" : "done" })}
                      onDue={(date) => patchItem(item, { dueDate: date })}
                      onOpen={() => setOpenItem(item)}
                      onDelete={() => undoDelete.remove(item)}
                    />
                  ))}
                </ul>
              </details>
            )}
          </section>
  );

  return (
    <>
      <PageHeader
        back={{ href: `/c/${clientId}?project=${meeting.projectId}`, label: meeting.projectName }}
        title={s?.title ?? "Meeting"}
        meta={`${meeting.clientName} · ${fmtDateTime(meeting.startedAt)}${minutes ? ` · ${minutes} min` : ""}`}
        actions={meeting.endedAt && (
          <button type="button" onClick={() => setMerging(true)} aria-label="Merge with another recording" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <Merge className="size-5" aria-hidden="true" />
          </button>
        )}
      />
      <MergeSheet
        open={merging}
        onClose={() => setMerging(false)}
        clientId={clientId}
        meetingId={meetingId}
        onMerged={(kept) => {
          setMerging(false);
          window.location.assign(`/m/${clientId}/${kept}`);
        }}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      <div>
      <div className="px-5 pt-4">
        <SegmentedControl<Tab>
          kind="tabs"
          size="sm"
          fullWidth
          aria-label="Meeting sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "summary", label: "Summary" },
            ...(wide ? [] : [{ value: "actions" as Tab, label: "Actions", count: openCount || undefined }]),
            { value: "feedback", label: "Feedback" },
            { value: "transcript", label: "Transcript" },
          ]}
        />
      </div>

      <main className="flex flex-col gap-6 px-5 pt-5 pb-6">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {!summary && tab !== "transcript" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] text-muted-foreground">No summary yet.</p>
            <button
              type="button"
              onClick={generate}
              disabled={generating || data.transcript.length === 0}
              className="min-h-12 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {generating ? "Summarizing… (up to a minute)" : "Generate summary"}
            </button>
          </div>
        )}

        {tab === "summary" && s && (
          <>
            {s.purpose && <p className="text-[15px] text-muted-foreground">{s.purpose}</p>}
            {s.summary.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="text-base leading-relaxed">{para}</p>
            ))}
            {(summary.tags.length > 0 || s.free_tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {[...summary.tags, ...s.free_tags].map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{t.replace(/_/g, " ")}</span>
                ))}
              </div>
            )}
            {s.decisions.length > 0 && <Section title="Decisions"><Bullets items={s.decisions} /></Section>}
            {(s.others_commitments?.length ?? 0) > 0 && <Section title="Others committed to"><Bullets items={s.others_commitments ?? []} /></Section>}
            {s.main_points.length > 0 && <Section title="Main points"><Bullets items={s.main_points} /></Section>}
            {pinned.length > 0 && (
              <Section title="Pinned during the meeting">
                <Bullets items={pinned.map((p) => p.text)} />
              </Section>
            )}
            {data.briefUpdates.length > 0 && (
              <Section title="Added to project brief">
                <ul className="flex flex-col gap-2">
                  {data.briefUpdates.map((u) => (
                    <li key={u.id} className="flex items-start gap-2">
                      <span className={cn("flex-1 text-[15px] leading-relaxed", u.dismissed && "text-muted-foreground line-through")}>{u.text}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setData((d) => d && { ...d, briefUpdates: d.briefUpdates.map((x) => (x.id === u.id ? { ...x, dismissed: !u.dismissed } : x)) });
                          const res = await sendJson(`/api/clients/${clientId}/amendments/${u.id}`, "PATCH", { dismissed: !u.dismissed });
                          if (!res.ok) { setError("Couldn't update that."); await load(); }
                        }}
                        className="min-h-9 shrink-0 text-[13px] text-link"
                      >
                        {u.dismissed ? "Restore" : "Dismiss"}
                      </button>
                    </li>
                  ))}
                </ul>
                <Link href={`/c/${clientId}?project=${meeting.projectId}`} className="text-[13px] text-link">See the full brief</Link>
              </Section>
            )}
            {s.key_quotes.length > 0 && (
              <Section title="Key quotes">
                {s.key_quotes.map((q, i) => (
                  <figure key={i} className="rounded-xl bg-surface px-4 py-3.5">
                    <blockquote className="text-[15px] leading-relaxed">“{q.quote}”</blockquote>
                    <figcaption className="mt-1.5 text-xs text-muted-foreground">{q.speaker} · {clock(q.at_ms / 1000)}</figcaption>
                  </figure>
                ))}
              </Section>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-4 text-[15px]">
              <button type="button" className="min-h-11 text-link" onClick={() => setEditing(true)}>Edit summary</button>
              {data.transcript.length > 0 && (
                <button
                  type="button"
                  className="min-h-11 text-link disabled:opacity-40"
                  disabled={generating}
                  onClick={() => (confirmRegen ? void generate() : setConfirmRegen(true))}
                >
                  {generating ? "Summarizing…" : confirmRegen ? "Tap again to regenerate" : "Regenerate"}
                </button>
              )}
              <span className="w-full text-xs text-muted-foreground">
                Version {summary.version} · {summary.source === "edit" ? "edited by you" : "generated"} · {fmtDateTime(summary.createdAt)}
                {confirmRegen && " · completed and edited action items are kept"}
              </span>
            </div>
          </>
        )}

        {tab === "actions" && !wide && actionsSection}

        {tab === "feedback" && s && (
          <>
            {s.stats && s.stats.speakers.length > 0 && (
              <Section title="Talk time">
                <div className="flex flex-col gap-2">
                  {s.stats.speakers.map((sp) => (
                    <div key={sp.label} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate">{sp.label}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(sp.share * 100)}%` }} />
                      </span>
                      <span className="text-muted-foreground tabular-nums">{Math.round(sp.share * 100)}%</span>
                    </div>
                  ))}
                </div>
                {!s.stats.me && (
                  <p className="text-[13px] text-muted-foreground">Name yourself &quot;Me&quot; on the Transcript tab, then regenerate, for feedback on your own talk time.</p>
                )}
              </Section>
            )}
            {s.feedback.suggestions.length > 0 && <Section title="Try next time"><Bullets items={s.feedback.suggestions} /></Section>}
            {s.feedback.went_well.length > 0 && <Section title="What went well"><Bullets items={s.feedback.went_well} /></Section>}
            {s.feedback.commitments_by_me.length > 0 && <Section title="You committed to"><Bullets items={s.feedback.commitments_by_me} /></Section>}
            {s.feedback.not_covered.length > 0 && <Section title="Didn't come up"><Bullets items={s.feedback.not_covered} /></Section>}
            {s.feedback.open_questions.length > 0 && <Section title="Open questions"><Bullets items={s.feedback.open_questions} /></Section>}
          </>
        )}

        {tab === "transcript" && (
          <>
            {data.speakers.length > 0 && (
              <Speakers
                speakers={data.speakers}
                map={data.speakerMap}
                onSave={async (map) => {
                  const res = await sendJson(`${base}/speakers`, "PUT", { map });
                  if (!res.ok) return setError("Couldn't save speaker names.");
                  await load();
                }}
              />
            )}
            {data.transcript.length > 0 ? (
              <Section title={`Transcript · deleted in ${daysLeft ?? 0} days`}>
                <div className="flex flex-col gap-3">
                  {data.transcript.map((t, i) => (
                    <p key={i} className="text-[15px] leading-relaxed">
                      <span className="font-semibold">{label(t.speaker)}</span>{" "}
                      <span className="text-xs text-muted-foreground tabular-nums">{clock(t.startMs / 1000)}</span>
                      <br />
                      {t.text}
                    </p>
                  ))}
                </div>
              </Section>
            ) : (
              <p className="text-[15px] text-muted-foreground">The full transcript has been deleted. The summary and action items are kept.</p>
            )}
          </>
        )}
      </main>
      </div>
      {wide && (
        <aside aria-label="Action items" className="flex flex-col gap-2 px-5 pt-4 lg:sticky lg:top-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action items{openCount ? ` · ${openCount} open` : ""}</h2>
          {actionsSection}
        </aside>
      )}
      </div>

      {undoDelete.toast}
      <ItemSheet
        item={sheetItem}
        onClose={() => setOpenItem(null)}
        onSave={(p) => (openItem ? patchItem(openItem, p) : undefined)}
        onDelete={async () => {
          if (!openItem) return;
          await sendJson(`/api/clients/${clientId}/action-items/${openItem.id}`, "DELETE");
          await load();
        }}
      />

      {summary && (
        <EditSummary
          open={editing}
          summary={summary}
          allowedTags={allowedTags}
          onClose={() => setEditing(false)}
          onSave={async (content, tags) => {
            const res = await sendJson(`${base}/summary`, "PUT", { content, tags });
            if (!res.ok) return setError("Couldn't save your edits.");
            setEditing(false);
            await load();
          }}
        />
      )}
    </>
  );
}

function Speakers({ speakers, map, onSave }: { speakers: number[]; map: Record<string, string>; onSave: (m: Record<string, string>) => Promise<void> }) {
  const [names, setNames] = useState<Record<string, string>>(map);
  useEffect(() => setNames(map), [map]);
  const me = Object.entries(names).find(([, n]) => n === "Me")?.[0] ?? "";
  const dirty = JSON.stringify(names) !== JSON.stringify(map);
  return (
    <Section title="Speakers">
      <p className="-mt-1 text-[13px] text-muted-foreground">Names are per meeting. No voice profiles are kept.</p>
      {speakers.map((sp) => {
        const key = String(sp);
        const isMe = names[key] === "Me";
        return (
          <div key={sp} className="grid grid-cols-[84px_1fr_auto] items-center gap-3">
            <span className="text-sm text-muted-foreground">Speaker {sp + 1}</span>
            <input
              value={isMe ? "" : (names[key] ?? "")}
              placeholder={isMe ? "Me" : "Name"}
              disabled={isMe}
              aria-label={`Name for speaker ${sp + 1}`}
              onChange={(e) => setNames({ ...names, [key]: e.target.value })}
              className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
            />
            <button
              type="button"
              aria-pressed={me === key}
              onClick={() => {
                const rest = Object.fromEntries(Object.entries(names).filter(([, n]) => n !== "Me"));
                setNames(me === key ? rest : { ...rest, [key]: "Me" });
              }}
              className={cn("min-h-11 rounded-xl border px-3 text-sm font-medium", me === key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              Me
            </button>
          </div>
        );
      })}
      {dirty && (
        <button type="button" onClick={() => onSave(names)} className="min-h-11 self-start rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground">
          Save names
        </button>
      )}
    </Section>
  );
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

function EditSummary({
  open,
  summary,
  allowedTags,
  onSave,
  onClose,
}: {
  open: boolean;
  summary: Summary;
  allowedTags: string[];
  onSave: (c: SummaryContentT, tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const c = summary.content;
  const initial = () => ({
    title: c.title,
    purpose: c.purpose,
    summary: c.summary,
    decisions: c.decisions.join("\n"),
    main_points: c.main_points.join("\n"),
    suggestions: c.feedback.suggestions.join("\n"),
    went_well: c.feedback.went_well.join("\n"),
    commitments_by_me: c.feedback.commitments_by_me.join("\n"),
    not_covered: c.feedback.not_covered.join("\n"),
    open_questions: c.feedback.open_questions.join("\n"),
  });
  const [f, setF] = useState(initial);
  const [tags, setTags] = useState<string[]>(summary.tags);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(initial()); setTags(summary.tags); } }, [open, summary]);

  const field = (key: keyof ReturnType<typeof initial>, label: string, rows = 3) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {rows === 1 ? (
        <input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="min-h-11 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring" />
      ) : (
        <textarea rows={rows} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" />
      )}
    </label>
  );

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} side="fullscreen">
      <DrawerContent title="Edit summary" description="Saves a new version. Lists take one entry per line.">
        <div className="flex flex-col gap-4">
          {field("title", "Title", 1)}
          {field("purpose", "Purpose", 2)}
          {field("summary", "Summary", 6)}
          {field("decisions", "Decisions")}
          {field("main_points", "Main points", 4)}
          {field("suggestions", "Try next time")}
          {field("went_well", "What went well")}
          {field("commitments_by_me", "You committed to")}
          {field("not_covered", "Didn't come up")}
          {field("open_questions", "Open questions")}
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1.5 text-[13px] text-muted-foreground">Tags</legend>
            {allowedTags.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={cn("min-h-9 rounded-full border px-3 text-[13px]", on ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground")}
                >
                  {t.replace(/_/g, " ")}
                </button>
              );
            })}
          </fieldset>
          <button
            type="button"
            disabled={saving || !f.title.trim()}
            className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
            onClick={async () => {
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
                participants: c.participants ?? [],
                others_commitments: c.others_commitments ?? [],
              }, tags);
              setSaving(false);
            }}
          >
            {saving ? "Saving…" : "Save as new version"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
