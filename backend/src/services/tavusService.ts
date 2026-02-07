import { config, hasTavus } from '../config.js';

type TavusCreateConversationResponse = {
  conversation_id: string;
  conversation_url: string;
  meeting_token?: string;
  status?: string;
  [k: string]: any;
};

function apiKey(): string {
  // Support both env variants while migrating.
  return (config.tavus.apiKey || config.tavus.realtimeApiKey || '').trim();
}

function baseUrl(): string {
  return 'https://tavusapi.com/v2';
}

export async function createTavusConversation(args: {
  conversationalContext?: string;
  customGreeting?: string;
  requireAuth?: boolean;
  conversationName?: string;
}): Promise<{ conversationId: string; conversationUrl: string; meetingToken?: string; raw: any; mock?: boolean }> {
  const key = apiKey();
  const personaId = (config.tavus.personaId || '').trim();
  const replicaId = (config.tavus.replicaId || '').trim();

  const forceMock = String(process.env.FORCE_MOCK_MEETING ?? '').trim() === '1';
  if (forceMock || !hasTavus() || !key || !personaId || !replicaId) {
    const conversationId = `mock-convo-${Date.now()}`;
    return {
      conversationId,
      conversationUrl: `/mock-meeting?sessionId=${encodeURIComponent(conversationId)}&reason=${encodeURIComponent(
        forceMock ? 'forcedMock' : 'missingTavusConfig'
      )}`,
      meetingToken: undefined,
      raw: { id: conversationId, mock: true, reason: forceMock ? 'forcedMock' : 'missingTavusConfig' },
      mock: true,
    };
  }

  const res = await fetch(`${baseUrl()}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      persona_id: personaId,
      replica_id: replicaId,
      require_auth: args.requireAuth ?? true,
      conversation_name: args.conversationName ?? 'CareZoom visit',
      conversational_context: args.conversationalContext,
      custom_greeting: args.customGreeting,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create Tavus conversation (${res.status}): ${text}`);
  }

  const data = (await res.json()) as TavusCreateConversationResponse;
  const conversationId = String(data?.conversation_id ?? '').trim();
  const conversationUrl = String(data?.conversation_url ?? '').trim();
  const meetingToken = data?.meeting_token ? String(data.meeting_token).trim() : undefined;
  if (!conversationId || !conversationUrl) {
    throw new Error(`Tavus response missing conversation_id/conversation_url: ${JSON.stringify(data)}`);
  }

  return { conversationId, conversationUrl, meetingToken, raw: data };
}

