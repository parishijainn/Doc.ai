import fs from 'fs';
import path from 'path';

export interface VisitRecord {
  id: string; // internal id
  /**
   * Historically "conversationId" (Tavus). Keep the name to avoid breaking routes.
   */
  conversationId: string;
  /**
   * Historically "conversationUrl" (Tavus/Daily room URL). Keep the name to avoid breaking routes.
   */
  conversationUrl: string;
  /**
   * Daily meeting token (returned by Tavus when `require_auth=true`).
   */
  meetingToken?: string;
  createdAt: string;
  updatedAt: string;
  utterances: { speaker: 'user' | 'replica' | 'system'; text: string; at: string }[];
  summary?: {
    whatIHeard: string;
    likelyPossibilities: string[];
    whatToDoNow: string[];
    warningSigns: string[];
    whoToSee: string;
    timeline: string;
    disclaimer: string;
    generatedAt: string;
    model?: string;
    fallback?: boolean;
  };
}

const visits = new Map<string, VisitRecord>(); // key: conversationId

const VISIT_DB_PATH = process.env.VISIT_DB_PATH ?? './logs/visits.json';

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(VISIT_DB_PATH)) return;
    const raw = fs.readFileSync(VISIT_DB_PATH, 'utf8');
    if (!raw.trim()) return;
    const arr = JSON.parse(raw) as VisitRecord[];
    if (!Array.isArray(arr)) return;
    for (const v of arr) {
      if (v?.conversationId) visits.set(v.conversationId, v);
    }
  } catch {
    // best-effort for MVP
  }
}

function persist() {
  try {
    ensureDir(VISIT_DB_PATH);
    const all = Array.from(visits.values());
    fs.writeFileSync(VISIT_DB_PATH, JSON.stringify(all, null, 2));
  } catch {
    // best-effort for MVP
  }
}

export function upsertVisit(v: Omit<VisitRecord, 'updatedAt' | 'utterances'> & { utterances?: VisitRecord['utterances'] }) {
  const now = new Date().toISOString();
  const existing = visits.get(v.conversationId);
  const record: VisitRecord = {
    id: v.id,
    conversationId: v.conversationId,
    conversationUrl: v.conversationUrl,
    meetingToken: v.meetingToken,
    createdAt: existing?.createdAt ?? v.createdAt,
    updatedAt: now,
    utterances: v.utterances ?? existing?.utterances ?? [],
    summary: existing?.summary,
  };
  visits.set(v.conversationId, record);
  persist();
  return record;
}

export function getVisitByConversationId(conversationId: string): VisitRecord | undefined {
  return visits.get(conversationId);
}

export function addUtterance(
  conversationId: string,
  speaker: VisitRecord['utterances'][number]['speaker'],
  text: string
) {
  const v = visits.get(conversationId);
  if (!v) return;
  v.utterances.push({ speaker, text, at: new Date().toISOString() });
  v.updatedAt = new Date().toISOString();
  persist();
}

export function setSummary(conversationId: string, summary: NonNullable<VisitRecord['summary']>) {
  const v = visits.get(conversationId);
  if (!v) return;
  v.summary = summary;
  v.updatedAt = new Date().toISOString();
  persist();
}

// Load persisted visits on server start so shared links survive restarts.
loadFromDisk();

