import { Router, json } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { runTriage } from '../services/triageService.js';
import { analyzeImage } from '../services/visionService.js';
import { auditConsent, auditVisitStart, auditVisitEnd, logAudit } from '../services/auditService.js';
import {
  createSession,
  getSession,
  appendTranscript,
  setConsent,
  addImageMetadata,
  endSession,
  getRecentTranscript,
} from '../store/sessionStore.js';

const router = Router();
router.use(json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/visit/start', (req, res) => {
  const session = createSession();
  auditVisitStart(session.id);
  res.json({ sessionId: session.id });
});

router.post('/visit/:id/consent', (req, res) => {
  const { id } = req.params;
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setConsent(id);
  auditConsent(id, 'v1');
  res.json({ ok: true });
});

router.post('/visit/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message, ageRange, conditions } = req.body ?? {};
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message required' });
  }
  appendTranscript(id, 'user', message);
  const recentTranscript = getRecentTranscript(id);
  const triage = await runTriage(message, {
    ageRange,
    conditions: Array.isArray(conditions) ? conditions : undefined,
    recentTranscript,
  });
  const responseText = formatTriageForAssistant(triage);
  appendTranscript(id, 'assistant', responseText);
  logAudit({ at: new Date().toISOString(), type: 'message', sessionId: id });
  res.json({
    triage,
    responseText,
  });
});

router.post('/visit/:id/image', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const file = req.file;
  if (!file?.buffer) return res.status(400).json({ error: 'image file required' });
  const imageId = uuidv4();
  const result = await analyzeImage(file.buffer, file.mimetype);
  addImageMetadata(id, imageId, result.imageType);
  const observationsText = result.observations.join(' ') + ' ' + result.disclaimer;
  appendTranscript(id, 'assistant', observationsText);
  logAudit({ at: new Date().toISOString(), type: 'image_upload', sessionId: id });
  res.json({ imageId, analysis: result });
});

router.get('/visit/:id/summary', (req, res) => {
  const { id } = req.params;
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const summary = buildVisitSummary(session);
  res.json({ summary });
});

router.post('/visit/:id/end', (req, res) => {
  const { id } = req.params;
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  endSession(id);
  auditVisitEnd(id);
  const summary = buildVisitSummary(session);
  res.json({ ok: true, summary });
});

function formatTriageForAssistant(triage: Awaited<ReturnType<typeof runTriage>>): string {
  if (triage.redFlagsTriggered && triage.emergencyAdvice) {
    return triage.emergencyAdvice;
  }
  const parts: string[] = [];
  if (triage.summary) parts.push(triage.summary);
  if (triage.possibleCauses?.length) {
    parts.push('Possible explanations: ' + triage.possibleCauses.join('; '));
  }
  if (triage.whatToDoNow?.length) {
    parts.push('What to do now: ' + triage.whatToDoNow.join('; '));
  }
  if (triage.warningSigns?.length) {
    parts.push('Warning signs to watch: ' + triage.warningSigns.join('; '));
  }
  if (triage.whoToSee) parts.push('Who to see: ' + triage.whoToSee);
  if (triage.questionsToAsk?.length) {
    parts.push('Questions to ask: ' + triage.questionsToAsk.join('; '));
  }
  return parts.join('\n\n');
}

function buildVisitSummary(session: ReturnType<typeof getSession>): Record<string, unknown> {
  if (!session) return {};
  const lastUser = session.transcript.filter((t) => t.role === 'user').pop();
  const lastAssistant = session.transcript.filter((t) => t.role === 'assistant').pop();
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    keySymptoms: lastUser?.text ?? '',
    adviceGiven: lastAssistant?.text ?? '',
    imageCount: session.imagesMetadata.length,
  };
}

export default router;
