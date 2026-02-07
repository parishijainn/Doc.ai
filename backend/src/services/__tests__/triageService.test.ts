import { runTriage } from '../triageService';

describe('triageService', () => {
  it('returns emergency advice and no routine advice when red flags present', async () => {
    const result = await runTriage('I have severe chest pain');
    expect(result.redFlagsTriggered).toBe(true);
    expect(result.emergencyAdvice).toBeDefined();
    expect(result.emergencyAdvice).toMatch(/911|emergency/);
    expect(result.possibleCauses).toEqual([]);
  });

  it('refuses dosing and suggests pharmacist when user asks for dose', async () => {
    const result = await runTriage('What dose of ibuprofen should I take?');
    expect(result.redFlagsTriggered).toBe(false);
    expect(result.whatToDoNow.some((s) => s.toLowerCase().includes('pharmacist') || s.toLowerCase().includes('doctor'))).toBe(true);
    expect(result.whatToDoNow.some((s) => s.toLowerCase().includes('dose') || s.toLowerCase().includes('dosing'))).toBe(true);
  });

  it('refuses dosing when user asks for prescription', async () => {
    const result = await runTriage('Can you prescribe me something for the pain?');
    expect(result.whatToDoNow.some((s) => /pharmacist|doctor|clinician/.test(s))).toBe(true);
  });

  it('returns structured triage for non-emergency symptom', async () => {
    const result = await runTriage('I have a mild rash on my forearm that started yesterday');
    expect(result.redFlagsTriggered).toBe(false);
    expect(result.summary).toBeTruthy();
    expect(result.possibleCauses !== undefined).toBe(true);
    expect(result.warningSigns !== undefined).toBe(true);
    expect(result.whoToSee).toBeTruthy();
  });
});
