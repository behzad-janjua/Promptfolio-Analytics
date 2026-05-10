import { NextRequest } from "next/server";

// Canadian tax brackets 2024 (federal + approximate Ontario provincial combined)
const FEDERAL_BRACKETS = [
  { min: 0, max: 55867, rate: 0.15 },
  { min: 55867, max: 111733, rate: 0.205 },
  { min: 111733, max: 154906, rate: 0.26 },
  { min: 154906, max: 220000, rate: 0.29 },
  { min: 220000, max: Infinity, rate: 0.33 },
];

// Ontario provincial rates (approximate)
const ONTARIO_BRACKETS = [
  { min: 0, max: 51446, rate: 0.0505 },
  { min: 51446, max: 102894, rate: 0.0915 },
  { min: 102894, max: 150000, rate: 0.1116 },
  { min: 150000, max: 220000, rate: 0.1216 },
  { min: 220000, max: Infinity, rate: 0.1316 },
];

function taxOnBrackets(
  income: number,
  brackets: { min: number; max: number; rate: number }[]
): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (income <= bracket.min) break;
    const taxableInBracket = Math.min(income, bracket.max) - bracket.min;
    tax += taxableInBracket * bracket.rate;
  }
  return tax;
}

// TFSA cumulative room by year (since 2009)
const TFSA_ANNUAL: Record<number, number> = {
  2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500,
  2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500,
  2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500,
  2024: 7000, 2025: 7000,
};

export interface TaxAnalysis {
  scenario: {
    income: number;
    realizedGains: number;
    province: string;
  };
  nonRegistered: {
    taxableGains: number; // 50% inclusion rate for capital gains in Canada
    marginalRate: number;
    taxOwed: number;
    netGains: number;
  };
  tfsa: {
    taxOwed: 0;
    netGains: number; // full amount kept
    savingsVsNonReg: number;
  };
  rrsp: {
    // RRSP defers tax — tax is paid on withdrawal
    taxOwed: 0;
    netGainsIfWithdrawnNow: number;
    taxOnWithdrawal: number;
  };
  tfsaRoom: {
    cumulativeSince2009: number;
    birthYear?: number;
    roomIfBornBefore2009: number;
    annualLimit2024: number;
  };
  rrspRoom: {
    maxContribution2024: number;
    estimatedRoomAt18Pct: number;
  };
  summary: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const income = parseFloat(searchParams.get("income") ?? "90000");
  const realizedGains = parseFloat(searchParams.get("realizedGains") ?? "5000");
  const birthYear = searchParams.get("birthYear")
    ? parseInt(searchParams.get("birthYear")!)
    : undefined;
  const province = searchParams.get("province") ?? "ON";

  if (isNaN(income) || income < 0) {
    return Response.json({ error: "income must be a non-negative number" }, { status: 400 });
  }
  if (isNaN(realizedGains)) {
    return Response.json({ error: "realizedGains must be a number" }, { status: 400 });
  }

  // Canadian capital gains inclusion rate: 50% (for amounts under $250k as of 2024 rules)
  const inclusionRate = realizedGains <= 250_000 ? 0.5 : 0.667;
  const taxableGains = realizedGains * inclusionRate;

  // Marginal rate = federal + Ontario (default)
  const baseFederalTax = taxOnBrackets(income, FEDERAL_BRACKETS);
  const withGainsFederalTax = taxOnBrackets(income + taxableGains, FEDERAL_BRACKETS);
  const federalMarginal = taxableGains > 0 ? (withGainsFederalTax - baseFederalTax) / taxableGains : 0;

  const baseProvincialTax = taxOnBrackets(income, ONTARIO_BRACKETS);
  const withGainsProvincialTax = taxOnBrackets(income + taxableGains, ONTARIO_BRACKETS);
  const provincialMarginal = taxableGains > 0 ? (withGainsProvincialTax - baseProvincialTax) / taxableGains : 0;

  const combinedMarginalRate = federalMarginal + provincialMarginal;
  const taxOwedNonReg = taxableGains * combinedMarginalRate;
  const netGainsNonReg = realizedGains - taxOwedNonReg;

  // TFSA: zero tax
  const netGainsTFSA = realizedGains;
  const savingsVsNonReg = taxOwedNonReg;

  // RRSP: gains are tax-deferred; on withdrawal, full amount is taxed as income
  const rrspWithdrawalTax =
    taxOnBrackets(income + realizedGains, FEDERAL_BRACKETS) +
    taxOnBrackets(income + realizedGains, ONTARIO_BRACKETS) -
    (taxOnBrackets(income, FEDERAL_BRACKETS) + taxOnBrackets(income, ONTARIO_BRACKETS));
  const netGainsRRSP = realizedGains - rrspWithdrawalTax;

  // TFSA room
  const currentYear = new Date().getFullYear();
  let tfsaRoomSince2009 = 0;
  for (let y = 2009; y <= Math.min(currentYear, 2025); y++) {
    tfsaRoomSince2009 += TFSA_ANNUAL[y] ?? 7000;
  }
  let roomIfBornBefore2009 = tfsaRoomSince2009;
  if (birthYear && birthYear > 1991) {
    // Only eligible after turning 18
    const eligibleYear = birthYear + 18;
    let room = 0;
    for (let y = Math.max(eligibleYear, 2009); y <= Math.min(currentYear, 2025); y++) {
      room += TFSA_ANNUAL[y] ?? 7000;
    }
    roomIfBornBefore2009 = room;
  }

  // RRSP: 18% of previous year earned income, max $31,560 (2024)
  const rrspMaxContribution = 31560;
  const estimatedRRSPRoom = Math.min(income * 0.18, rrspMaxContribution);

  const summary =
    `With $${realizedGains.toLocaleString()} in capital gains on an income of $${income.toLocaleString()}: ` +
    `In a non-registered account you'd owe ~$${taxOwedNonReg.toFixed(0)} in tax (${(combinedMarginalRate * 100 * inclusionRate).toFixed(1)}% effective rate on gains). ` +
    `A TFSA saves you $${savingsVsNonReg.toFixed(0)} — you keep 100% of the gain. ` +
    `In an RRSP, gains are deferred but withdrawals are taxed as income (~$${rrspWithdrawalTax.toFixed(0)} if withdrawn now).`;

  const result: TaxAnalysis = {
    scenario: { income, realizedGains, province },
    nonRegistered: {
      taxableGains: parseFloat(taxableGains.toFixed(2)),
      marginalRate: parseFloat((combinedMarginalRate * 100).toFixed(2)),
      taxOwed: parseFloat(taxOwedNonReg.toFixed(2)),
      netGains: parseFloat(netGainsNonReg.toFixed(2)),
    },
    tfsa: {
      taxOwed: 0,
      netGains: parseFloat(netGainsTFSA.toFixed(2)),
      savingsVsNonReg: parseFloat(savingsVsNonReg.toFixed(2)),
    },
    rrsp: {
      taxOwed: 0,
      netGainsIfWithdrawnNow: parseFloat(netGainsRRSP.toFixed(2)),
      taxOnWithdrawal: parseFloat(rrspWithdrawalTax.toFixed(2)),
    },
    tfsaRoom: {
      cumulativeSince2009: tfsaRoomSince2009,
      birthYear,
      roomIfBornBefore2009,
      annualLimit2024: TFSA_ANNUAL[2024],
    },
    rrspRoom: {
      maxContribution2024: rrspMaxContribution,
      estimatedRoomAt18Pct: parseFloat(estimatedRRSPRoom.toFixed(2)),
    },
    summary,
  };

  return Response.json(result);
}
