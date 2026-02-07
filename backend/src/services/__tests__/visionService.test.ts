import { analyzeImage } from '../visionService';

describe('visionService', () => {
  it('returns analysis with imageType and observations for a buffer', async () => {
    const buffer = Buffer.alloc(100, 0);
    const result = await analyzeImage(buffer, 'image/jpeg');
    expect(result.imageType).toBeDefined();
    expect(['skin', 'wound', 'bruise', 'medication_label', 'exercise_pose', 'unknown']).toContain(result.imageType);
    expect(Array.isArray(result.observations)).toBe(true);
    expect(result.disclaimer).toBeTruthy();
    expect(result.disclaimer.toLowerCase()).toMatch(/not a diagnosis|clinician/);
  });

  it('includes medication disclaimer', async () => {
    const buffer = Buffer.alloc(100, 0);
    const result = await analyzeImage(buffer, 'image/jpeg');
    expect(result.disclaimer).toBeTruthy();
  });
});
