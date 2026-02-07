import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface AuditEntry {
  at: string;
  type: 'consent' | 'visit_start' | 'visit_end' | 'message' | 'image_upload' | 'care_search' | 'error';
  sessionId?: string;
  payload?: Record<string, unknown>;
}

function ensureLogDir(): string {
  const dir = path.dirname(config.audit.logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return config.audit.logPath;
}

export function logAudit(entry: AuditEntry): void {
  const line = JSON.stringify({
    ...entry,
    at: entry.at || new Date().toISOString(),
  }) + '\n';
  try {
    const file = ensureLogDir();
    fs.appendFileSync(file, line);
  } catch (e) {
    console.error('Audit log write failed:', e);
  }
}

export function auditConsent(sessionId: string, consentVersion: string): void {
  logAudit({
    at: new Date().toISOString(),
    type: 'consent',
    sessionId,
    payload: { consentVersion },
  });
}

export function auditVisitStart(sessionId: string): void {
  logAudit({
    at: new Date().toISOString(),
    type: 'visit_start',
    sessionId,
  });
}

export function auditVisitEnd(sessionId: string): void {
  logAudit({
    at: new Date().toISOString(),
    type: 'visit_end',
    sessionId,
  });
}
