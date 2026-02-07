import { config, hasOpenAI } from '../config.js';
import { checkRedFlags } from './redFlagService.js';
import type { TriageResult } from '../types.js';

const SAFETY_SYSTEM = `You are a supportive health information assistant for older adults. You must NEVER:
- Say "I diagnose you with X" or give a definitive diagnosis. Use phrases like "possible causes," "this could be," "only a clinician can diagnose."
- Provide medication dosing, prescription advice, or contraindication guesses. For meds say: "Ask your pharmacist or doctor about options; check your allergies and med list with them."
- Give emergency care advice beyond: "Call 911 (or your local emergency number) immediately."
If the user describes emergency symptoms (chest pain, difficulty breathing, stroke signs, severe bleeding, head injury with confusion, suicidal thoughts, severe allergic reaction), respond ONLY with: advise calling emergency services and that you cannot provide emergency care. Do not give other advice.
Use simple language, short sentences. Be calm and check understanding. Offer a 1–2 sentence recap ("What I understood") and then: possible causes (ranked, conservative), what to do now (safe steps), warning signs (when to seek urgent care), who to see (PCP vs urgent care vs specialist), and questions to ask their clinician.`;

const REFUSAL_DOSING =
  "I can't recommend specific doses or prescribe medications. Please talk to your doctor or pharmacist—they can check your other medications and allergies and give you safe dosing.";

const REFUSAL_MINOR =
  "This tool is intended for adults. If you're under 18, please have a parent or guardian help you talk to a clinician.";

function parseStructuredResponse(text: string): Partial<TriageResult> {
  const result: Partial<TriageResult> = {
    summary: '',
    possibleCauses: [],
    whatToDoNow: [],
    warningSigns: [],
    whoToSee: '',
    questionsToAsk: [],
    redFlagsTriggered: false,
  };
  const sections: Record<string, string> = {};
  let current = 'summary';
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('what i understood') || lower.includes('recap')) {
      current = 'summary';
      sections.summary = line.replace(/^#?\s*(what i understood|recap):?/i, '').trim();
      continue;
    }
    if (lower.includes('possible cause') || lower.includes('possible explanation')) {
      current = 'possibleCauses';
      continue;
    }
    if (lower.includes('what to do now')) {
      current = 'whatToDoNow';
      continue;
    }
    if (lower.includes('warning sign') || lower.includes('when to seek')) {
      current = 'warningSigns';
      continue;
    }
    if (lower.includes('who to see') || lower.includes('who to call')) {
      current = 'whoToSee';
      const afterColon = line.replace(/^#?\s*(who to see|who to call):?/i, '').trim();
      if (afterColon) result.whoToSee = afterColon;
      continue;
    }
    if (lower.includes('question') && lower.includes('ask')) {
      current = 'questionsToAsk';
      continue;
    }
    const bullet = line.replace(/^[\s\-*•]\s*/, '').trim();
    if (!bullet) continue;
    if (current === 'possibleCauses') result.possibleCauses!.push(bullet);
    else if (current === 'whatToDoNow') result.whatToDoNow!.push(bullet);
    else if (current === 'warningSigns') result.warningSigns!.push(bullet);
    else if (current === 'questionsToAsk') result.questionsToAsk!.push(bullet);
    else if (current === 'summary') result.summary = result.summary ? result.summary + ' ' + bullet : bullet;
    else if (current === 'whoToSee') result.whoToSee = result.whoToSee ? result.whoToSee + ' ' + bullet : bullet;
  }
  if (!result.summary && text) result.summary = text.slice(0, 300);
  if (!result.whoToSee && text) {
    const whoMatch = text.match(/who to see[:\s]+([^\n]+)/i);
    if (whoMatch) result.whoToSee = whoMatch[1].trim();
    else result.whoToSee = 'Your primary care provider or urgent care';
  }
  return result;
}

async function triageWithLLM(
  userMessage: string,
  context: { ageRange?: string; conditions?: string[]; recentTranscript?: string }
): Promise<string> {
  if (!hasOpenAI() || !config.openai.apiKey) {
    return mockTriageResponse(userMessage);
  }
  const openai = (await import('openai')).default;
  const client = new openai({ apiKey: config.openai.apiKey });
  const prompt = `Context: Age range: ${context.ageRange ?? 'not given'}. Conditions: ${(context.conditions ?? []).join(', ') || 'none listed'}.
User says: ${userMessage}
${context.recentTranscript ? `Recent conversation: ${context.recentTranscript.slice(-1500)}` : ''}

Respond with clear sections: What I understood (short recap). Possible causes (bullet list, conservative). What to do now (safe home care). Warning signs (when to seek urgent care). Who to see (PCP/urgent care/specialist). Questions to ask (bullet list). Use simple language. Do not diagnose.`;
  const completion = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: SAFETY_SYSTEM },
      { role: 'user', content: prompt },
    ],
    max_tokens: 800,
  });
  const content = completion.choices[0]?.message?.content ?? '';
  return content;
}

function mockTriageResponse(userMessage: string): string {
  return `What I understood: You're describing something that may need a clinician's evaluation.

Possible causes: I can't diagnose—only a clinician can. Common possibilities for similar symptoms include minor skin irritation, mild strain, or something that needs in-person assessment.

What to do now:
• Keep the area clean and avoid further irritation.
• Note when it started and what makes it better or worse.
• If you have a photo, you can show it to your doctor or nurse.

Warning signs: Seek urgent care or call your doctor if you develop fever, spreading redness, severe pain, difficulty breathing, or any symptom that worries you.

Who to see: Schedule a visit with your primary care provider, or use urgent care if you need same-day evaluation.

Questions to ask: What might be causing this? Do I need any tests? When should I come back or call if it doesn't improve?`;
}

export async function runTriage(
  userMessage: string,
  options: {
    ageRange?: string;
    conditions?: string[];
    recentTranscript?: string;
  } = {}
): Promise<TriageResult> {
  const red = checkRedFlags(userMessage);
  if (red.triggered) {
    return {
      summary: 'You described symptoms that may indicate an emergency.',
      possibleCauses: [],
      whatToDoNow: [],
      warningSigns: [],
      whoToSee: '',
      questionsToAsk: [],
      redFlagsTriggered: true,
      emergencyAdvice: red.emergencyMessage ?? undefined,
    };
  }

  const dosingRequest = /\b(dose|dosage|how much to take|mg|ml|prescription)\b/i.test(userMessage);
  if (dosingRequest) {
    return {
      summary: 'You asked about medication dosing.',
      possibleCauses: [],
      whatToDoNow: [REFUSAL_DOSING],
      warningSigns: [],
      whoToSee: 'Pharmacist or prescribing doctor',
      questionsToAsk: ['What is the right dose for me?', 'Are there interactions with my other medications?'],
      redFlagsTriggered: false,
    };
  }

  const minorMention = /\b(i\'m\s+\d{1,2}\s+years?\s+old|i\'m\s+(a\s+)?(kid|child|teen|minor))\b/i.test(userMessage);
  if (minorMention) {
    return {
      summary: 'This tool is for adults.',
      possibleCauses: [],
      whatToDoNow: [REFUSAL_MINOR],
      warningSigns: [],
      whoToSee: 'A parent or guardian and a clinician',
      questionsToAsk: [],
      redFlagsTriggered: false,
    };
  }

  const raw = await triageWithLLM(userMessage, {
    ageRange: options.ageRange,
    conditions: options.conditions,
    recentTranscript: options.recentTranscript,
  });
  const parsed = parseStructuredResponse(raw);
  return {
    summary: parsed.summary ?? raw.slice(0, 200),
    possibleCauses: parsed.possibleCauses ?? [],
    whatToDoNow: parsed.whatToDoNow ?? [],
    warningSigns: parsed.warningSigns ?? [],
    whoToSee: parsed.whoToSee ?? 'Your primary care provider or urgent care',
    questionsToAsk: parsed.questionsToAsk ?? [],
    redFlagsTriggered: false,
    ...(parsed.emergencyAdvice && { emergencyAdvice: parsed.emergencyAdvice }),
  };
}
