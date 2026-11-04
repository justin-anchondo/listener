import { randomUUID } from "node:crypto";
import { withSettings } from "@/lib/db/scoped";
import { meetingTypeKey } from "@/lib/policy/limits";

// Meeting types the owner edits in the app. The first read seeds them from
// config.yaml `templates`, so config stays the source of the defaults.

export type MeetingType = { id: string; key: string; name: string; watchFor: string[]; archived: boolean };

type Row = { id: string; key: string; name: string; watch_for: string[]; archived: boolean };
const toType = (r: Row): MeetingType => ({ id: r.id, key: r.key, name: r.name, watchFor: r.watch_for, archived: r.archived });

export const defaultTypeName = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export async function listMeetingTypes(defaults: Record<string, { watch_for: string[] }>, includeArchived = false): Promise<MeetingType[]> {
  return withSettings(async (tx) => {
    let rows = await tx<Row[]>`select id, key, name, watch_for, archived from meeting_types order by position, created_at`;
    if (rows.length === 0) {
      let position = 0;
      for (const [key, t] of Object.entries(defaults)) {
        await tx`insert into meeting_types (id, key, name, watch_for, position)
          values (${randomUUID()}, ${key}, ${defaultTypeName(key)}, ${t.watch_for}, ${position++}) on conflict (key) do nothing`;
      }
      rows = await tx<Row[]>`select id, key, name, watch_for, archived from meeting_types order by position, created_at`;
    }
    return rows.filter((r) => includeArchived || !r.archived).map(toType);
  });
}

export async function getMeetingType(key: string): Promise<MeetingType | null> {
  return withSettings(async (tx) => {
    const rows = await tx<Row[]>`select id, key, name, watch_for, archived from meeting_types where key = ${key}`;
    return rows[0] ? toType(rows[0]) : null;
  });
}

export async function createMeetingType(name: string, watchFor: string[]): Promise<MeetingType> {
  return withSettings(async (tx) => {
    const base = meetingTypeKey(name);
    const taken = new Set((await tx<{ key: string }[]>`select key from meeting_types where key like ${`${base}%`}`).map((r) => r.key));
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base.slice(0, 36)}_${n}`;
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(position), -1)::int + 1 as next from meeting_types`;
    const id = randomUUID();
    await tx`insert into meeting_types (id, key, name, watch_for, position) values (${id}, ${key}, ${name}, ${watchFor}, ${next})`;
    return { id, key, name, watchFor, archived: false };
  });
}

/** Renaming keeps the key, so past meetings still point at the same type. */
export async function updateMeetingType(id: string, u: { name?: string; watchFor?: string[]; archived?: boolean }): Promise<boolean> {
  return withSettings(async (tx) => {
    const rows = await tx`update meeting_types set
        name = coalesce(${u.name ?? null}, name),
        watch_for = coalesce(${u.watchFor ?? null}::text[], watch_for),
        archived = coalesce(${u.archived ?? null}, archived)
      where id = ${id} returning id`;
    return rows.length > 0;
  });
}
