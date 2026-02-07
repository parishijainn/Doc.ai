import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { createConversation } from '../services/tavusService.js';
import { analyzeImage } from '../services/visionService.js';
import { addUtterance, getVisitByConversationId, setSummary, upsertVisit } from '../store/visitTable.js';
import { buildVisitSummary } from '../services/visitSummaryService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CAREZOOM_CONVERSATION_CONTEXT = `You are CareZoom, a calm, senior-friendly pre-visit helper for telehealth.

CRITICAL SAFETY RULES:
- You cannot diagnose. Never say “I diagnose you with X.” Use “possible causes” and “only a clinician can diagnose.”
- You do not provide definitive treatment. You offer education, conservative triage guidance, and next steps.
- Medication: never give dosing or prescription instructions. Only general categories and “ask your pharmacist/doctor; check allergies and med list.”
- If emergency/red flags: advise calling 911 (or local emergency number) immediately and stop routine advice.

RECAPPING RULES (“recap budget”):
- Provide at most ONE recap per complaint unless the user explicitly asks for a recap/summarize/repeat.
- Do NOT start every turn with “I’m hearing…”. If you recap, use “So to summarize…” once.
- After the user says “thanks”, “ok”, “good”, “got it”, do NOT reprint the full plan. Respond briefly and ask what they want next.

TURN-TAKING + PACING:
- Never speak more than 2–3 sentences without pausing or asking a short check-in question (e.g., “Does that make sense?”).
- Deliver the plan in steps: “First… (pause/check-in)”, “Next… (pause/check-in)”.
- Use natural short pauses like: “Okay—give me a second.”

MULTI-SPEAKER HANDLING:
- If you detect cues like “tell her”, “tell him”, “my mom”, “my dad”, “she said”, “he said”, multiple names, or multiple voices:
  Ask: “Just to confirm—am I speaking with the patient, or a caregiver?”

CLINICIAN THOROUGHNESS TRIGGERS (ask extra questions when relevant):
- If cough lasts > 2–4 weeks OR coughing blood OR chest pain OR shortness of breath:
  Ask about: travel/TB exposure, weight loss/night sweats, smoking/vaping, COPD/asthma history, leg swelling/pain (clot risk), immunosuppression.

OUTPUT FORMAT (use these section titles only when delivering the plan; avoid repeating every turn):
So to summarize…
Most likely causes
What you can do now
Warning signs
Who to see
Timeline

Style: one question at a time during intake. Short sentences. Teach-back at the end.`;

const CAREZOOM_GREETING =
  `Hi. I’m CareZoom. I’m here to help you figure out safe next steps before you schedule a visit. ` +
  `I’m not a doctor and I can’t diagnose you. If you have chest pain, trouble breathing, stroke symptoms, severe bleeding, or feel unsafe, call 911 now.`;

/**
 * POST /api/visit/start
 * Creates a Tavus conversation and returns conversation_id + conversation_url.
 * This is the primary entrypoint for shareable caregiver links.
 */
router.post('/api/visit/start', async (req, res) => {
  const personaId = (req.body?.persona_id ?? req.body?.personaId ?? config.tavus.personaId ?? '').trim();
  const replicaId = (req.body?.replica_id ?? req.body?.replicaId ?? config.tavus.replicaId ?? '').trim();
  if (!personaId || !replicaId) {
    return res.status(400).json({ error: 'persona_id and replica_id are required' });
  }

  try {
    const convo = await createConversation({
      personaId,
      replicaId,
      conversationName: 'CareZoom Visit',
      conversationalContext: CAREZOOM_CONVERSATION_CONTEXT,
      customGreeting: CAREZOOM_GREETING,
      requireAuth: true,
      maxParticipants: 3,
    });

    upsertVisit({
      id: `visit-${Date.now()}`,
      conversationId: convo.conversationId,
      conversationUrl: convo.conversationUrl,
      meetingToken: convo.meetingToken,
      createdAt: new Date().toISOString(),
    });

    return res.json({
      conversation_id: convo.conversationId,
      conversation_url: convo.conversationUrl,
      meeting_token: convo.meetingToken,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create Tavus conversation', details: String(e) });
  }
});

/**
 * GET /api/visit/:conversationId
 * For caregiver join: returns the conversation_url (+ token if auth required).
 */
router.get('/api/visit/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  return res.json({
    conversation_id: v.conversationId,
    conversation_url: v.conversationUrl,
    meeting_token: v.meetingToken,
  });
});

/**
 * POST /api/visit/:conversationId/utterance
 * Store utterances (captions) so we can generate a summary later.
 */
router.post('/api/visit/:conversationId/utterance', (req, res) => {
  const { conversationId } = req.params;
  const { speaker, text } = req.body ?? {};
  if (!speaker || !text) return res.status(400).json({ error: 'speaker and text required' });
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  addUtterance(conversationId, speaker, String(text));
  res.json({ ok: true });
});

/**
 * POST /api/visit/:conversationId/image
 * Analyze image and return a safe prompt the client can send to Tavus via interactions protocol.
 */
router.post('/api/visit/:conversationId/image', upload.single('image'), async (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });

  const file = req.file;
  if (!file?.buffer) return res.status(400).json({ error: 'image file required' });

  const analysis = await analyzeImage(file.buffer, file.mimetype);

  const tavusPrompt =
    `The user uploaded an image. Classification: ${analysis.imageType}. ` +
    `Non-diagnostic observations: ${analysis.observations.join(' ')} ` +
    `Please respond with your structured sections (What I’m hearing / Most likely causes / What you can do now / Warning signs / Who to see / Timeline). ` +
    `Do not diagnose and do not give medication dosing.`;

  return res.json({ analysis, tavus_prompt: tavusPrompt });
});

router.get('/api/visit/:conversationId/summary', async (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  const refresh = (req.query.refresh as string) === '1';
  if (!refresh && v.summary) {
    return res.json({ conversation_id: v.conversationId, summary: v.summary });
  }

  const summary = await buildVisitSummary(v);
  setSummary(conversationId, {
    ...summary,
    generatedAt: new Date().toISOString(),
    model: process.env.OPENAI_MODEL,
    fallback: !process.env.OPENAI_API_KEY,
  });
  return res.json({ conversation_id: v.conversationId, summary });
});

export default router;

