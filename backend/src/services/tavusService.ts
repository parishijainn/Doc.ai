import { config, hasTavus } from '../config.js';

const TAVUS_BASE = process.env.TAVUS_BASE_URL?.trim() || 'https://tavusapi.com/v2';
const AUTO_CLEANUP = (process.env.TAVUS_AUTO_CLEANUP_CONCURRENCY ?? 'true').toLowerCase() === 'true';

async function listActiveConversations(): Promise<
  Array<{ conversation_id: string; conversation_name?: string; status?: string }>
> {
  const res = await fetch(`${TAVUS_BASE}/conversations?status=active&limit=50&page=1`, {
    method: 'GET',
    headers: {
      'x-api-key': config.tavus.apiKey,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: any[] };
  return (data.data ?? []).map((c) => ({
    conversation_id: c.conversation_id,
    conversation_name: c.conversation_name,
    status: c.status,
  }));
}

async function cleanupCareZoomConversations(): Promise<number> {
  try {
    const active = await listActiveConversations();
    const carezoom = active.filter((c) => (c.conversation_name ?? '').toLowerCase().includes('carezoom'));
    let ended = 0;
    for (const c of carezoom) {
      const ok = await endConversation(c.conversation_id);
      if (ok.ok) ended++;
    }
    return ended;
  } catch {
    return 0;
  }
}

export interface CreateConversationInput {
  personaId: string;
  replicaId: string;
  conversationName?: string;
  /** Appended to persona context; use this for CareZoom safety policy and flow. */
  conversationalContext?: string;
  /** Greeting the replica will say when participant joins. */
  customGreeting?: string;
  /** If true, returns meeting_token and requires it to join. */
  requireAuth?: boolean;
  maxParticipants?: number;
  testMode?: boolean;
  callbackUrl?: string;
}

export interface CreateConversationOutput {
  conversationId: string;
  conversationUrl: string;
  meetingToken?: string;
  status?: string;
}

export async function createConversation(input: CreateConversationInput): Promise<CreateConversationOutput> {
  if (!hasTavus() || !config.tavus.apiKey) {
    // MVP fallback (no billing / no external dependency)
    const conversationId = `mock-convo-${Date.now()}`;
    return {
      conversationId,
      conversationUrl: `https://example.invalid/${conversationId}`,
      status: 'mock',
    };
  }

  const doCreate = async () =>
    fetch(`${TAVUS_BASE}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.tavus.apiKey,
      },
      body: JSON.stringify({
        persona_id: input.personaId,
        replica_id: input.replicaId,
        conversation_name: input.conversationName ?? 'CareZoom Visit',
        conversational_context: input.conversationalContext,
        custom_greeting: input.customGreeting,
        require_auth: input.requireAuth ?? true,
        max_participants: input.maxParticipants ?? 3, // senior + replica + optional caregiver
        test_mode: input.testMode ?? false,
        callback_url: input.callbackUrl,
      }),
    });

  let res = await doCreate();

  // Tavus enforces account-wide concurrency. In dev, it’s easy to leak rooms.
  // If we hit the limit, auto-end any active “CareZoom” rooms once and retry.
  if (!res.ok && res.status === 400 && AUTO_CLEANUP) {
    const body = await res.text().catch(() => '');
    if (body.toLowerCase().includes('maximum concurrent')) {
      await cleanupCareZoomConversations();
      res = await doCreate();
    } else {
      // restore body by recreating a Response-like error message
      throw new Error(`Tavus create conversation failed (${res.status}): ${body}`);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavus create conversation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    conversation_id: string;
    conversation_url: string;
    meeting_token?: string;
    status?: string;
  };

  return {
    conversationId: data.conversation_id,
    conversationUrl: data.conversation_url,
    meetingToken: data.meeting_token,
    status: data.status,
  };
}

export async function endConversation(conversationId: string): Promise<{ ok: boolean }> {
  if (!hasTavus() || !config.tavus.apiKey) return { ok: true };
  const res = await fetch(`${TAVUS_BASE}/conversations/${encodeURIComponent(conversationId)}/end`, {
    method: 'POST',
    headers: {
      'x-api-key': config.tavus.apiKey,
    },
  });
  return { ok: res.ok };
}
