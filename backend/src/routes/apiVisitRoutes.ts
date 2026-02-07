import { Router } from 'express';
import multer from 'multer';
import { createTavusConversation } from '../services/tavusService.js';
import { analyzeImage } from '../services/visionService.js';
import { buildTavusPrompt, checkAge, checkDuplicateIngredient, checkEmergency, generateOtcPlan } from '../services/otcPlanService.js';
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
 * Creates a Tavus conversation and returns conversation_id + conversation_url + meeting_token (compat).
 */
router.post('/api/visit/start', async (_req, res) => {
  try {
    const convo = await createTavusConversation({
      conversationalContext: CAREZOOM_CONVERSATION_CONTEXT,
      customGreeting: CAREZOOM_GREETING,
      requireAuth: true,
      conversationName: `CareZoom visit ${new Date().toISOString()}`,
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
      // New keys (kept for the newer frontend shape)
      session_id: convo.conversationId,
      join_url: convo.conversationUrl,
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      return res.status(401).json({ error: 'Tavus authentication failed', details: msg });
    }
    return res.status(500).json({ error: 'Failed to create Tavus conversation', details: msg });
  }
});

/**
 * GET /api/visit/:conversationId
 * For caregiver join: returns the conversation_url (+ token).
 */
router.get('/api/visit/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  return res.json({
    conversation_id: v.conversationId,
    conversation_url: v.conversationUrl,
    meeting_token: v.meetingToken,
    session_id: v.conversationId,
    join_url: v.conversationUrl,
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
 * Analyze image and return a safe prompt the client can optionally send to the agent.
 */
router.post('/api/visit/:conversationId/image', upload.single('image'), async (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });

  const file = req.file;
  if (!file?.buffer) return res.status(400).json({ error: 'image file required' });

  const analysis = await analyzeImage(file.buffer, file.mimetype);

  const agentPrompt =
    `The user uploaded an image. Classification: ${analysis.imageType}. ` +
    `Non-diagnostic observations: ${analysis.observations.join(' ')} ` +
    `Please respond with your structured sections (What I’m hearing / Most likely causes / What you can do now / Warning signs / Who to see / Timeline). ` +
    `Do not diagnose and do not give medication dosing.`;

  // Keep tavus_prompt key for backwards compatibility with older frontend logic.
  return res.json({ analysis, tavus_prompt: agentPrompt, agent_prompt: agentPrompt });
});

/**
 * POST /api/visit/:conversationId/otc-plan
 * Generates a label-based OTC medication plan and returns a tavus_prompt to share into the meeting.
 * Also stores a system utterance so summaries include it.
 */
router.post('/api/visit/:conversationId/otc-plan', async (req, res) => {
  const { conversationId } = req.params;
  const v = getVisitByConversationId(conversationId);
  if (!v) return res.status(404).json({ error: 'Visit not found' });

  const { medication, symptomInput } = req.body ?? {};
  if (!medication || !symptomInput) return res.status(400).json({ error: 'medication and symptomInput required' });

  try {
    const input = {
      symptoms: Array.isArray(symptomInput.symptoms) ? symptomInput.symptoms.map(String) : [],
      severity: Number(symptomInput.severity ?? 5),
      age: Number(symptomInput.age ?? 0),
      otherMeds: String(symptomInput.otherMeds ?? ''),
      otherSymptoms: symptomInput.otherSymptoms ? String(symptomInput.otherSymptoms) : undefined,
      proceedDespiteInteraction: Boolean(symptomInput.proceedDespiteInteraction),
    };

    const med = {
      id: String(medication.id ?? ''),
      name: String(medication.name ?? ''),
      active_ingredient: String(medication.active_ingredient ?? ''),
      strength: String(medication.strength ?? ''),
      standard_label_dose: String(medication.standard_label_dose ?? ''),
      max_daily_dose: String(medication.max_daily_dose ?? ''),
      symptom_targets: Array.isArray(medication.symptom_targets) ? medication.symptom_targets.map(String) : [],
      contraindications: Array.isArray(medication.contraindications) ? medication.contraindications.map(String) : [],
      min_age_years: medication.min_age_years != null ? Number(medication.min_age_years) : undefined,
      do_not_use_with: Array.isArray(medication.do_not_use_with) ? medication.do_not_use_with.map(String) : undefined,
    };

    // Hard safety checks
    const emergency = checkEmergency(input);
    if (!emergency.ok) {
      const prompt = buildTavusPrompt({ medication: med, input, emergencyMessage: emergency.error });
      addUtterance(conversationId, 'system', `Medication scan flagged emergency: ${emergency.error}`);
      return res.json({ success: true, emergency: true, emergencyMessage: emergency.error, tavus_prompt: prompt });
    }

    const ageCheck = checkAge(input, med);
    if (!ageCheck.ok) return res.status(400).json({ success: false, error: ageCheck.error });

    const dupCheck = checkDuplicateIngredient(input, med);
    if (!dupCheck.ok) return res.status(400).json({ success: false, error: dupCheck.error });

    const out = await generateOtcPlan(med, input);
    const prompt = buildTavusPrompt({ medication: med, input, plan: out.plan });

    addUtterance(conversationId, 'system', `Medication scan: ${med.name} (${med.active_ingredient} · ${med.strength}).`);
    addUtterance(conversationId, 'system', `Medication plan: ${out.plan.labelUsagePlan} | Max: ${out.plan.doNotExceed} | Avoid if: ${out.plan.avoidIf}`);

    return res.json({ success: true, plan: out.plan, tavus_prompt: prompt, error: out.error });
  } catch (e) {
    return res.status(500).json({ success: false, error: `Failed to generate plan: ${String(e)}` });
  }
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

