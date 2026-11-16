export const SQFT_PER_ACRE = 43_560;

export type CalcInput = { homes: number; clearZoneFt: number; sharePct: number; grant: number };
export type Benchmark = { name: string; costPerAcre: number };
export type CalcResult = {
  acresPerHome: number;
  acresToTreat: number;
  avgCost: number;
  lowCost: number;
  highCost: number;
  avgCostPerAcre: number;
  coverage: number; // 0..1
  grantPerHome: number;
  acresGrantBuys: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export function normaliseInput(i: CalcInput): CalcInput {
  return {
    homes: clamp(Math.round(i.homes), 0, 1_000_000),
    clearZoneFt: clamp(i.clearZoneFt, 0, 1000),
    sharePct: clamp(i.sharePct, 0, 100),
    grant: clamp(i.grant, 0, 1_000_000_000),
  };
}

/** Defensible-space estimate: circle of the clear-zone radius around each treated home, priced per acre from benchmark programs. */
export function estimate(raw: CalcInput, benchmarks: Benchmark[]): CalcResult | null {
  const rates = benchmarks.map((b) => b.costPerAcre).filter((n) => n > 0);
  if (rates.length === 0) return null;
  const i = normaliseInput(raw);
  const acresPerHome = (Math.PI * i.clearZoneFt ** 2) / SQFT_PER_ACRE;
  const acresToTreat = i.homes * (i.sharePct / 100) * acresPerHome;
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const avgCost = acresToTreat * avgRate;
  const coverage = avgCost > 0 ? Math.min(1, i.grant / avgCost) : 0;
  return {
    acresPerHome,
    acresToTreat,
    avgCost,
    lowCost: acresToTreat * Math.min(...rates),
    highCost: acresToTreat * Math.max(...rates),
    avgCostPerAcre: avgRate,
    coverage,
    grantPerHome: i.homes > 0 ? i.grant / i.homes : 0,
    acresGrantBuys: avgRate > 0 ? Math.min(acresToTreat, i.grant / avgRate) : 0,
  };
}
