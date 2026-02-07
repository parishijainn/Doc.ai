import { config, hasOpenAI } from '../config.js';
import type { VisitRecord } from '../store/visitTable.js';

export async function buildVisitSummary(visit: VisitRecord): Promise<{
  whatIHeard: string;
  likelyPossibilities: string[];
  whatToDoNow: string[];
  warningSigns: string[];
  whoToSee: string;
  timeline: string;
  disclaimer: string;
}> {
  const disclaimer =
    'This is not a diagnosis. Only a clinician can diagnose. If you have emergency symptoms (chest pain, trouble breathing, stroke symptoms, severe bleeding), call 911 or your local emergency number now.';

  const transcript = visit.utterances
    .slice(-40)
    .map((u) => `${u.speaker}: ${u.text}`)
    .join('\n');

  const lastUser = visit.utterances
    .filter((u) => u.speaker === 'user')
    .slice(-2)
    .map((u) => u.text)
    .join(' ');

  const lower = `${transcript}\n${lastUser}`.toLowerCase();

  const likelyFromRules = (): string[] => {
    // Conservative keyword-based buckets (not diagnostic).
    if (/\b(cough|coughing|phlegm|sputum)\b/.test(lower)) {
      return [
        'A viral respiratory infection (common cold) or lingering cough after a virus',
        'Post-nasal drip (from allergies or sinus irritation)',
        'Acid reflux/GERD irritation',
        'Asthma or airway irritation (including smoke/vaping exposure)',
      ];
    }
    if (/\b(rash|itch|hives|redness|eczema|acne)\b/.test(lower)) {
      return [
        'Skin irritation or allergic/contact dermatitis (new soap, detergent, lotion, plant exposure)',
        'Eczema flare or dry skin irritation',
        'A fungal rash in moist areas (if ring-shaped or in skin folds)',
        'Acne/follicle irritation (if bumps around hair follicles)',
      ];
    }
    if (/\b(cut|wound|bleeding|stitch|burn)\b/.test(lower)) {
      return [
        'A minor cut/scrape that may just need gentle wound care',
        'Skin infection risk if redness spreads, warmth increases, or pus appears',
        'A deeper wound that needs in-person evaluation (especially if gaping or contaminated)',
      ];
    }
    if (/\b(fall|fell|sprain|strain|twist|ankle|knee|shoulder|back pain|bruise|swelling)\b/.test(lower)) {
      return [
        'A muscle strain or ligament sprain',
        'A bruise/contusion with swelling',
        'A fracture risk if there is severe pain, inability to bear weight/use the limb, or deformity',
      ];
    }
    if (/\b(medication|pill|bottle|label)\b/.test(lower)) {
      return [
        'Medication questions are best confirmed with your pharmacist using the bottle label',
        'Side effects or interactions are possible—your clinician/pharmacist can review your full medication list safely',
      ];
    }
    return [
      'Several common causes are possible. Only a clinician can diagnose—this summary focuses on next steps.',
    ];
  };

  if (!hasOpenAI() || !config.openai.apiKey) {
    // Friendly structured fallback: still return all required sections.
    return {
      whatIHeard:
        lastUser
          ? `So to summarize… you described: ${lastUser}`
          : 'So to summarize… this visit did not capture enough transcript to generate a detailed recap.',
      likelyPossibilities: likelyFromRules().map(
        (x) => `${x} (possible cause—only a clinician can diagnose)`
      ),
      whatToDoNow: [
        'Write down your main symptoms, when they started, and what makes them better or worse.',
        'If you took photos, bring them to your appointment.',
        'If you feel worse or are worried, seek care sooner.',
      ],
      warningSigns: [
        'Call emergency services now for chest pain/pressure, trouble breathing, stroke symptoms, severe bleeding, or severe allergic reaction.',
        'Seek urgent care for rapidly worsening symptoms, high fever, new confusion, or severe pain.',
      ],
      whoToSee: 'Primary care, urgent care, or the most relevant specialist based on your main symptom',
      timeline: 'If worsening today, seek same-day care; otherwise, schedule within the next few days.',
      disclaimer,
    };
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: config.openai.apiKey });

  const prompt = `Create a senior-friendly visit summary with these exact sections:
- What I’m hearing (1–2 sentences)
- Most likely causes (2–4 bullet points, conservative, not diagnostic)
- What you can do now (3–6 bullets, safe)
- Warning signs (3–6 bullets, emergency/urgent triggers)
- Who to see (one line)
- Timeline (one line)

Rules: do NOT diagnose. No medication dosing. Use plain language.

Transcript:
${transcript}`;

  const completion = await client.chat.completions.create({
    model: config.openai.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 700,
  });

  const text = completion.choices[0]?.message?.content ?? '';

  // Lightweight parsing: keep as strings, split bullets.
  const section = (name: string) => {
    const re = new RegExp(`${name}\\s*:?\\s*([\\s\\S]*?)(\\n\\n|$)`, 'i');
    const m = text.match(re);
    return (m?.[1] ?? '').trim();
  };

  const bullets = (s: string) =>
    s
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean);

  return {
    whatIHeard: section("What I[’']?m hearing") || text.slice(0, 220),
    likelyPossibilities: bullets(section('Most likely causes')),
    whatToDoNow: bullets(section('What you can do now')),
    warningSigns: bullets(section('Warning signs')),
    whoToSee: section('Who to see') || 'Primary care or urgent care',
    timeline: section('Timeline') || 'If symptoms worsen, seek care sooner.',
    disclaimer,
  };
}

