import { Router } from 'express';
import { buildTavusPrompt, checkAge, checkDuplicateIngredient, checkEmergency, generateOtcPlan } from '../services/otcPlanService.js';

const router = Router();

/**
 * POST /api/otc/plan
 * Generate a label-based plan (no visit required).
 */
router.post('/api/otc/plan', async (req, res) => {
  const { medication, symptomInput } = req.body ?? {};
  if (!medication || !symptomInput) return res.status(400).json({ success: false, error: 'medication and symptomInput required' });

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

    const emergency = checkEmergency(input);
    if (!emergency.ok) {
      const prompt = buildTavusPrompt({ medication: med, input, emergencyMessage: emergency.error });
      return res.json({ success: true, emergency: true, emergencyMessage: emergency.error, tavus_prompt: prompt });
    }

    const ageCheck = checkAge(input, med);
    if (!ageCheck.ok) return res.status(400).json({ success: false, error: ageCheck.error });

    const dupCheck = checkDuplicateIngredient(input, med);
    if (!dupCheck.ok) return res.status(400).json({ success: false, error: dupCheck.error });

    const out = await generateOtcPlan(med, input);
    const prompt = buildTavusPrompt({ medication: med, input, plan: out.plan });
    return res.json({ success: true, plan: out.plan, tavus_prompt: prompt, error: out.error });
  } catch (e) {
    return res.status(500).json({ success: false, error: `Failed to generate plan: ${String(e)}` });
  }
});

export default router;

