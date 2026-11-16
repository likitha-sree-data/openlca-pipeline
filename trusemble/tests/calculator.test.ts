import { describe, expect, it } from 'vitest';
import { estimate, normaliseInput } from '../src/lib/calculator';

const bench = [{ name: 'a', costPerAcre: 1844 }, { name: 'b', costPerAcre: 1873 }, { name: 'c', costPerAcre: 1987 }];

describe('calculator', () => {
  // Figures shown on the public calculator for the default inputs: 300 homes, 100 ft, 50%, $75,000.
  const r = estimate({ homes: 300, clearZoneFt: 100, sharePct: 50, grant: 75000 }, bench)!;
  it('matches the reference screen', () => {
    expect(r.acresPerHome).toBeCloseTo(0.721, 3);
    expect(r.acresToTreat).toBeCloseTo(108.2, 1);
    expect(r.avgCost).toBeGreaterThan(205_000);
    expect(r.avgCost).toBeLessThan(206_500);
    expect(r.coverage * 100).toBeCloseTo(36.5, 1);
    expect(r.grantPerHome).toBe(250);
    expect(r.acresGrantBuys).toBeCloseTo(39.4, 0);
    expect(r.lowCost).toBeLessThan(r.avgCost);
    expect(r.highCost).toBeGreaterThan(r.avgCost);
  });
  it('caps coverage at 100% and never divides by zero', () => {
    expect(estimate({ homes: 10, clearZoneFt: 100, sharePct: 50, grant: 1e9 }, bench)!.coverage).toBe(1);
    const z = estimate({ homes: 0, clearZoneFt: 100, sharePct: 50, grant: 5000 }, bench)!;
    expect(z.avgCost).toBe(0);
    expect(z.coverage).toBe(0);
    expect(Number.isFinite(z.grantPerHome)).toBe(true);
  });
  it('returns null without benchmarks and clamps wild input', () => {
    expect(estimate({ homes: 1, clearZoneFt: 1, sharePct: 1, grant: 1 }, [])).toBeNull();
    expect(normaliseInput({ homes: -5, clearZoneFt: 9999, sharePct: 400, grant: NaN })).toEqual({ homes: 0, clearZoneFt: 1000, sharePct: 100, grant: 0 });
  });
});
