import { checkRedFlags } from '../redFlagService';

describe('redFlagService', () => {
  it('detects chest pain', () => {
    const r = checkRedFlags('I have chest pain and pressure');
    expect(r.triggered).toBe(true);
    expect(r.labels).toContain('chest_pain');
    expect(r.emergencyMessage).toMatch(/911|emergency/);
  });

  it('detects difficulty breathing', () => {
    const r = checkRedFlags('I can\'t breathe');
    expect(r.triggered).toBe(true);
    expect(r.labels).toContain('breathing_difficulty');
  });

  it('detects stroke symptoms', () => {
    const r = checkRedFlags('My arm is weak and my speech is slurred');
    expect(r.triggered).toBe(true);
    expect(r.labels).toContain('stroke_symptoms');
  });

  it('detects suicidal ideation', () => {
    const r = checkRedFlags('I have been having suicidal thoughts');
    expect(r.triggered).toBe(true);
    expect(r.labels).toContain('suicidal_ideation');
  });

  it('detects severe allergic reaction', () => {
    const r = checkRedFlags('My throat is closing and I have a severe allergic reaction');
    expect(r.triggered).toBe(true);
    expect(r.labels).toContain('severe_allergic_reaction');
  });

  it('returns not triggered for non-emergency', () => {
    const r = checkRedFlags('I have a small rash on my arm');
    expect(r.triggered).toBe(false);
    expect(r.labels).toHaveLength(0);
    expect(r.emergencyMessage).toBeNull();
  });
});
