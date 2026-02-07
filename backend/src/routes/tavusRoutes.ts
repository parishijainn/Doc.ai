import { Router } from 'express';
import { config } from '../config.js';
import { createConversation, endConversation } from '../services/tavusService.js';
import { attachTavusConversation, getSession } from '../store/sessionStore.js';
import { logAudit } from '../services/auditService.js';

const router = Router();

const CAREZOOM_CONVERSATION_CONTEXT = `You are CareZoom, a calm, senior-friendly pre-visit helper for telehealth.

CRITICAL SAFETY RULES:
- You cannot diagnose. Never say “I diagnose you with X.” Use “possible causes” and “only a clinician can diagnose.”
- You do not provide definitive treatment. You offer education, conservative triage guidance, and next steps.
- Medication: never give dosing or prescription instructions. Only general categories and “ask your pharmacist/doctor; check allergies and med list.”
- If emergency/red flags: advise calling 911 (or local emergency number) immediately and stop routine advice.
Red flags include: chest pain/pressure, trouble breathing, stroke symptoms (face droop, arm weakness, slurred speech, sudden confusion), severe bleeding, head injury with confusion or repeated vomiting, suicidal thoughts, severe allergic reaction (throat closing, facial swelling), unresponsive, seizure.

CONVERSATION STYLE:
- Short sentences. No jargon. One question at a time.
- Teach-back: ask the user to repeat the plan in their own words.

RECAPPING RULES (“recap budget”):
- Provide at most ONE recap per complaint unless the user explicitly asks for a recap/summarize/repeat.
- Do NOT start every turn with “I’m hearing…”. If you recap, use “So to summarize…” once.
- After the user says “thanks”, “ok”, “good”, “got it”, do NOT reprint the full plan. Respond briefly and ask what they want next.

TURN-TAKING + PACING:
- Never speak more than 2–3 sentences without pausing or asking a short check-in question (“Does that make sense?”).
- Deliver the plan in steps: “First…”, pause; “Next…”, pause.

MULTI-SPEAKER HANDLING:
- If cues like “tell her/him”, “my mom/dad”, “she/he said”, multiple names/voices:
  Ask: “Just to confirm—am I speaking with the patient, or a caregiver?”

CLINICIAN THOROUGHNESS TRIGGERS:
- If cough >2–4 weeks OR coughing blood OR chest pain OR shortness of breath:
  Ask about travel/TB exposure, weight loss/night sweats, smoking/vaping, COPD/asthma, leg swelling (clot risk), immunosuppression.

PHASES:
A) Warm intro + consent reminder (not a doctor).
B) Symptom story: main problem; onset; severity 0–10; location; associated symptoms; triggers; prior episodes.
C) Possible causes framing (2–4). Conservative.
D) Next steps plan:
  - What I heard (1–2 sentences)
  - Likely possibilities (bullets)
  - What to do now (24–48h) (bullets)
  - Warning signs / go now if (bullets)
  - Who to see (PCP vs urgent care vs specialist)
  - What to ask / bring to appointment
E) Close: offer summary + offer to find care near them.`;

const CAREZOOM_GREETING =
  `Hi. I’m CareZoom. I’m here to help you figure out safe next steps before you schedule a visit. ` +
  `I’m not a doctor and I can’t diagnose you, but I can help with possible causes, warning signs, and what to ask a clinician. ` +
  `If you have chest pain, trouble breathing, stroke symptoms, severe bleeding, or feel unsafe, please call 911 now.`;

router.post('/api/tavus/conversation/start', async (req, res) => {
  const { sessionId, personaId, replicaId } = (req.body ?? {}) as {
    sessionId?: string;
    personaId?: string;
    replicaId?: string;
  };

  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.consentGivenAt) return res.status(403).json({ error: 'Consent required' });

  // If already created for this visit, return it.
  if (session.tavusConversationId && session.tavusConversationUrl) {
    return res.json({
      conversation_id: session.tavusConversationId,
      conversation_url: session.tavusConversationUrl,
      meeting_token: session.tavusMeetingToken,
    });
  }

  const pId = (personaId ?? config.tavus.personaId ?? '').trim();
  const rId = (replicaId ?? config.tavus.replicaId ?? '').trim();
  if (!pId || !rId) {
    return res.status(400).json({ error: 'personaId and replicaId required (or set TAVUS_PERSONA_ID/TAVUS_REPLICA_ID)' });
  }

  try {
    const convo = await createConversation({
      personaId: pId,
      replicaId: rId,
      conversationalContext: CAREZOOM_CONVERSATION_CONTEXT,
      customGreeting: CAREZOOM_GREETING,
      requireAuth: true,
      maxParticipants: 3,
    });

    attachTavusConversation(sessionId, {
      conversationId: convo.conversationId,
      conversationUrl: convo.conversationUrl,
      meetingToken: convo.meetingToken,
    });

    logAudit({ at: new Date().toISOString(), type: 'message', sessionId, payload: { tavus_conversation_id: convo.conversationId } });

    return res.json({
      conversation_id: convo.conversationId,
      conversation_url: convo.conversationUrl,
      meeting_token: convo.meetingToken,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start Tavus conversation', details: String(e) });
  }
});

router.post('/api/tavus/conversation/:conversationId/end', async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
  const result = await endConversation(conversationId);
  res.json(result);
});

export default router;

