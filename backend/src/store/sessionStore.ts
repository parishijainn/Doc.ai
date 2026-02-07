import type { VisitSession } from '../types.js';

const sessions = new Map<string, VisitSession>();

export function createSession(): VisitSession {
  const id = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const session: VisitSession = {
    id,
    transcript: [],
    imagesMetadata: [],
    startedAt: new Date().toISOString(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): VisitSession | undefined {
  return sessions.get(id);
}

export function appendTranscript(sessionId: string, role: 'user' | 'assistant', text: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.transcript.push({ role, text, at: new Date().toISOString() });
  }
}

export function setConsent(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.consentGivenAt = new Date().toISOString();
}

export function addImageMetadata(sessionId: string, imageId: string, type: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.imagesMetadata.push({ id: imageId, type, uploadedAt: new Date().toISOString() });
  }
}

export function attachTavusConversation(
  sessionId: string,
  convo: { conversationId: string; conversationUrl: string; meetingToken?: string }
): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.tavusConversationId = convo.conversationId;
  s.tavusConversationUrl = convo.conversationUrl;
  s.tavusMeetingToken = convo.meetingToken;
  s.tavusStartedAt = new Date().toISOString();
}

export function endSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.endedAt = new Date().toISOString();
}

export function getRecentTranscript(sessionId: string, maxChars: number = 2000): string {
  const s = sessions.get(sessionId);
  if (!s) return '';
  const lines = s.transcript.map((t) => `${t.role}: ${t.text}`);
  const full = lines.join('\n');
  return full.length <= maxChars ? full : full.slice(-maxChars);
}
