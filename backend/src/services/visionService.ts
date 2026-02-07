import { config, hasOpenAI } from '../config.js';
import type { ImageAnalysisResult, ImageClassificationType } from '../types.js';

const VISION_SAFETY =
  'Describe only what you see in non-diagnostic language (e.g. "redness," "swelling," "visible text"). Never state a diagnosis. For medication labels, extract only the drug name and strength if visible. For exercise images, give simple posture tips and always add: "Stop if you feel pain; consult a PT or doctor if it worsens."';

async function classifyWithVision(
  imageBase64: string,
  mimeType: string
): Promise<{ type: ImageClassificationType; observations: string[]; medicationName?: string; medicationStrength?: string; postureTips?: string[] }> {
  if (!hasOpenAI() || !config.openai.apiKey) {
    return mockImageAnalysis();
  }
  const openai = (await import('openai')).default;
  const client = new openai({ apiKey: config.openai.apiKey });
  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: 'system',
        content: `You are an image assistant for health context. ${VISION_SAFETY} Classify the image as one of: skin, wound, bruise, medication_label, exercise_pose, or unknown. Reply with JSON: { "type": "...", "observations": [], "medicationName": null, "medicationStrength": null, "postureTips": null }`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    max_tokens: 400,
  });
  const content = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content.replace(/```json?\s*|\s*```/g, ''));
    return {
      type: parsed.type ?? 'unknown',
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      medicationName: parsed.medicationName,
      medicationStrength: parsed.medicationStrength,
      postureTips: parsed.postureTips,
    };
  } catch {
    return mockImageAnalysis();
  }
}

function mockImageAnalysis(): {
  type: ImageClassificationType;
  observations: string[];
  medicationName?: string;
  medicationStrength?: string;
  postureTips?: string[];
} {
  return {
    type: 'skin',
    observations: [
      'The image appears to show a skin area. I cannot diagnose—only a clinician can.',
      'Consider noting the location, size, and when it appeared for your doctor.',
    ],
    postureTips: undefined,
  };
}

const DISCLAIMER =
  'This is not a diagnosis. Only a clinician can diagnose. For medications, verify with your pharmacist and check your allergy and medication list.';

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<ImageAnalysisResult> {
  const base64 = imageBuffer.toString('base64');
  const result = await classifyWithVision(base64, mimeType);
  return {
    imageType: result.type,
    observations: result.observations,
    medicationName: result.medicationName,
    medicationStrength: result.medicationStrength,
    postureTips: result.postureTips,
    disclaimer: DISCLAIMER,
  };
}
