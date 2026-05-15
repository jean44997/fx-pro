export type BonusStatus = "pending" | "analysis" | "approved" | "refused" | "credited";
export type LoyaltyStatus = "Standard" | "Silver" | "Gold" | "Platinum" | "VIP";

export type BonusCountry = {
  code: string;
  name: string;
  currency: string;
  settlement: string;
  compliance: string;
};

export type BonusTier = {
  threshold: number;
  bonus: number;
  label: string;
  rarity: string;
  baseProbability: number;
};

export type BonusEvaluationInput = {
  userId: string;
  depositId: string;
  amount: number;
  currency: string;
  countryCode?: string;
  createdAt?: string;
  accountAgeDays?: number;
  loginCount?: number;
  transactionCount?: number;
  transactionVolume?: number;
  kycStatus?: string;
  riskFlags?: string[];
};

export type BonusEvaluation = {
  bonus_id: string;
  user_id: string;
  country: string;
  currency: string;
  status: BonusStatus;
  eligible: boolean;
  reason: string;
  loyalty_status: LoyaltyStatus;
  trust_score: number;
  probability: number;
  approval_roll: number;
  will_approve: boolean;
  first_deposit_locked: boolean;
  first_deposit_txn_id: string;
  first_deposit_amount: number;
  first_deposit_currency: string;
  first_deposit_confirmed_at: string;
  selected_threshold?: number;
  bonus_amount?: number;
  payout_window_days?: number;
  review_at?: string;
  estimated_credit_at?: string;
  risk_flags: string[];
  created_at: string;
  updated_at: string;
};

export const DEFAULT_BONUS_COUNTRY = "CI";
export const BONUS_MIN_WINDOW_DAYS = 7;
export const BONUS_MAX_WINDOW_DAYS = 30;

export const BONUS_COUNTRIES: BonusCountry[] = [
  { code: "CI", name: "Cote d'Ivoire", currency: "XOF", settlement: "7 a 30 jours", compliance: "Mobile Money, carte, virement et validation KYC conseillee." },
  { code: "SN", name: "Senegal", currency: "XOF", settlement: "7 a 30 jours", compliance: "Compte personnel requis, paiement trace uniquement." },
  { code: "CM", name: "Cameroun", currency: "XAF", settlement: "7 a 30 jours", compliance: "Mobile Money et virement bancaire sous controle interne." },
  { code: "GA", name: "Gabon", currency: "XAF", settlement: "7 a 30 jours", compliance: "Verification anti-abus avant attribution." },
  { code: "FR", name: "France", currency: "EUR", settlement: "7 a 30 jours", compliance: "SEPA/carte, controle KYC renforce pour gros montants." },
  { code: "US", name: "Etats-Unis", currency: "USD", settlement: "7 a 30 jours", compliance: "Carte ou virement, controle d'identite recommande." },
  { code: "GB", name: "Royaume-Uni", currency: "GBP", settlement: "7 a 30 jours", compliance: "Compte bancaire au nom du titulaire requis." },
  { code: "NG", name: "Nigeria", currency: "NGN", settlement: "7 a 30 jours", compliance: "Verification compte, appareil et historique d'activite." },
  { code: "MA", name: "Maroc", currency: "MAD", settlement: "7 a 30 jours", compliance: "Validation interne avant bonus ou retrait sensible." },
  { code: "ZA", name: "Afrique du Sud", currency: "ZAR", settlement: "7 a 30 jours", compliance: "Controle KYC et anti-fraude sur moyens de paiement." },
  { code: "KE", name: "Kenya", currency: "KES", settlement: "7 a 30 jours", compliance: "Mobile wallet et historique compte analyses." },
  { code: "GH", name: "Ghana", currency: "GHS", settlement: "7 a 30 jours", compliance: "Controle du premier depot recu confirme uniquement." },
];

const XOF_TIERS: BonusTier[] = [
  { threshold: 10000, bonus: 3000, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
  { threshold: 20000, bonus: 8000, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
  { threshold: 30000, bonus: 13000, label: "Prime", rarity: "Selection active", baseProbability: 0.5 },
  { threshold: 50000, bonus: 22000, label: "Elite 50K", rarity: "Traitement renforce", baseProbability: 0.62 },
  { threshold: 100000, bonus: 50000, label: "Gold 100K", rarity: "Acces rare", baseProbability: 0.75 },
  { threshold: 250000, bonus: 140000, label: "VIP 250K", rarity: "Fenetre prioritaire", baseProbability: 0.88 },
];

export const BONUS_CATALOG: Record<string, BonusTier[]> = {
  XOF: XOF_TIERS,
  XAF: XOF_TIERS,
  EUR: [
    { threshold: 25, bonus: 8, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 50, bonus: 20, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 100, bonus: 45, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 250, bonus: 125, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 500, bonus: 280, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 1000, bonus: 620, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  USD: [
    { threshold: 25, bonus: 7, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 50, bonus: 18, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 100, bonus: 42, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 250, bonus: 120, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 500, bonus: 260, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 1000, bonus: 600, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  GBP: [
    { threshold: 20, bonus: 6, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 40, bonus: 15, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 85, bonus: 35, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 200, bonus: 95, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 400, bonus: 210, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 850, bonus: 500, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  NGN: [
    { threshold: 20000, bonus: 6000, label: "Starter", rarity: "Acces limite", baseProbability: 0.28 },
    { threshold: 50000, bonus: 18000, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.39 },
    { threshold: 100000, bonus: 45000, label: "Prime", rarity: "Selection active", baseProbability: 0.51 },
    { threshold: 250000, bonus: 130000, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.64 },
    { threshold: 500000, bonus: 280000, label: "Gold", rarity: "Acces rare", baseProbability: 0.77 },
    { threshold: 1000000, bonus: 650000, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.88 },
  ],
  MAD: [
    { threshold: 250, bonus: 75, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 500, bonus: 200, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 1000, bonus: 450, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 2500, bonus: 1250, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 5000, bonus: 2800, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 10000, bonus: 6200, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  ZAR: [
    { threshold: 500, bonus: 150, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 1000, bonus: 400, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 2000, bonus: 900, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 5000, bonus: 2500, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 10000, bonus: 5600, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 20000, bonus: 12400, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  KES: [
    { threshold: 3500, bonus: 1000, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 7000, bonus: 2800, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 14000, bonus: 6200, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 35000, bonus: 17500, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 70000, bonus: 39000, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 140000, bonus: 86000, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
  GHS: [
    { threshold: 300, bonus: 90, label: "Starter", rarity: "Acces limite", baseProbability: 0.3 },
    { threshold: 650, bonus: 250, label: "Momentum", rarity: "Priorite basse", baseProbability: 0.4 },
    { threshold: 1300, bonus: 580, label: "Prime", rarity: "Selection active", baseProbability: 0.52 },
    { threshold: 3200, bonus: 1600, label: "Elite", rarity: "Traitement renforce", baseProbability: 0.66 },
    { threshold: 6500, bonus: 3600, label: "Gold", rarity: "Acces rare", baseProbability: 0.78 },
    { threshold: 13000, bonus: 8000, label: "VIP", rarity: "Fenetre prioritaire", baseProbability: 0.9 },
  ],
};

export function getBonusCountry(code?: string) {
  return BONUS_COUNTRIES.find((item) => item.code === code) || BONUS_COUNTRIES.find((item) => item.code === DEFAULT_BONUS_COUNTRY)!;
}

export function getBonusCountryByCurrency(currency: string) {
  return BONUS_COUNTRIES.find((item) => item.currency === currency) || getBonusCountry(DEFAULT_BONUS_COUNTRY);
}

export function getBonusCatalog(countryCode?: string, currencyOverride?: string) {
  const country = getBonusCountry(countryCode);
  const currency = currencyOverride || country.currency;
  return BONUS_CATALOG[currency] || BONUS_CATALOG.USD;
}

export function getMinimumBonusDeposit(countryCode?: string, currencyOverride?: string) {
  const catalog = getBonusCatalog(countryCode, currencyOverride);
  return catalog[0]?.threshold || 0;
}

export function selectBonusTier(amount: number, countryCode?: string, currencyOverride?: string) {
  const catalog = getBonusCatalog(countryCode, currencyOverride);
  return [...catalog].reverse().find((tier) => amount >= tier.threshold) || null;
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function daysBetween(from?: string, to = new Date().toISOString()) {
  if (!from) return 0;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export function stableRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

export function computeTrustScore(input: BonusEvaluationInput) {
  const accountAge = clamp(input.accountAgeDays || 0, 0, 365);
  const logins = clamp(input.loginCount || 0, 0, 80);
  const txCount = clamp(input.transactionCount || 0, 0, 80);
  const volume = clamp(Math.log10(Math.max(1, input.transactionVolume || 0)) * 10, 0, 20);
  const kyc = input.kycStatus === "verified" ? 18 : input.kycStatus === "review" ? 8 : 0;
  const riskPenalty = Math.min(32, (input.riskFlags || []).length * 8);
  return Math.round(clamp(24 + accountAge / 10 + logins / 6 + txCount / 5 + volume + kyc - riskPenalty));
}

export function getLoyaltyStatus(score: number, volume = 0): LoyaltyStatus {
  if (score >= 86 && volume >= 100000) return "VIP";
  if (score >= 78) return "Platinum";
  if (score >= 66) return "Gold";
  if (score >= 52) return "Silver";
  return "Standard";
}

export function getStatusBoost(status: LoyaltyStatus) {
  return ({ Standard: 0, Silver: 0.05, Gold: 0.1, Platinum: 0.15, VIP: 0.2 } as Record<LoyaltyStatus, number>)[status];
}

export function computePayoutWindowDays(seed: string, status: LoyaltyStatus) {
  const ranges: Record<LoyaltyStatus, [number, number]> = {
    Standard: [21, 30],
    Silver: [16, 26],
    Gold: [12, 22],
    Platinum: [9, 18],
    VIP: [7, 14],
  };
  const [min, max] = ranges[status];
  const roll = stableRandom(`${seed}:payout-window`);
  return Math.max(BONUS_MIN_WINDOW_DAYS, Math.min(BONUS_MAX_WINDOW_DAYS, Math.floor(min + roll * (max - min + 1))));
}

export function addDaysIso(source: string, days: number) {
  const date = new Date(source);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function createBonusEvaluation(input: BonusEvaluationInput): BonusEvaluation {
  const now = new Date().toISOString();
  const country = input.countryCode ? getBonusCountry(input.countryCode) : getBonusCountryByCurrency(input.currency);
  const tier = selectBonusTier(input.amount, country.code, input.currency);
  const trustScore = computeTrustScore(input);
  const loyalty = getLoyaltyStatus(trustScore, input.transactionVolume || 0);
  const seed = `${input.userId}:${input.depositId}:${input.amount}:${input.currency}`;
  const approvalRoll = stableRandom(`${seed}:approval`);
  const riskFlags = input.riskFlags || [];

  if (!tier) {
    return {
      bonus_id: `bonus_${input.userId}`,
      user_id: input.userId,
      country: country.code,
      currency: input.currency,
      status: "refused",
      eligible: false,
      reason: "Premier depot recu confirme sous le minimum du catalogue bonus.",
      loyalty_status: loyalty,
      trust_score: trustScore,
      probability: 0,
      approval_roll: approvalRoll,
      will_approve: false,
      first_deposit_locked: true,
      first_deposit_txn_id: input.depositId,
      first_deposit_amount: input.amount,
      first_deposit_currency: input.currency,
      first_deposit_confirmed_at: input.createdAt || now,
      risk_flags: riskFlags,
      created_at: now,
      updated_at: now,
    };
  }

  const probability = clamp(tier.baseProbability + trustScore / 1000 + getStatusBoost(loyalty), 0.08, 0.96);
  const payoutDays = computePayoutWindowDays(seed, loyalty);
  const confirmedAt = input.createdAt || now;
  const creditAt = addDaysIso(confirmedAt, payoutDays);
  const reviewAt = addDaysIso(confirmedAt, Math.max(BONUS_MIN_WINDOW_DAYS, payoutDays - 1));

  return {
    bonus_id: `bonus_${input.userId}`,
    user_id: input.userId,
    country: country.code,
    currency: input.currency,
    status: "analysis",
    eligible: true,
    reason: "Compte eligible: premier depot recu confirme verrouille et en analyse interne.",
    loyalty_status: loyalty,
    trust_score: trustScore,
    probability: Number(probability.toFixed(4)),
    approval_roll: Number(approvalRoll.toFixed(4)),
    will_approve: approvalRoll <= probability && riskFlags.length < 3,
    first_deposit_locked: true,
    first_deposit_txn_id: input.depositId,
    first_deposit_amount: input.amount,
    first_deposit_currency: input.currency,
    first_deposit_confirmed_at: confirmedAt,
    selected_threshold: tier.threshold,
    bonus_amount: tier.bonus,
    payout_window_days: payoutDays,
    review_at: reviewAt,
    estimated_credit_at: creditAt,
    risk_flags: riskFlags,
    created_at: now,
    updated_at: now,
  };
}

export function nextBonusStatus(current: any, now = new Date()) {
  if (!current || current.status === "credited" || current.status === "refused") return current?.status as BonusStatus | undefined;
  const reviewAt = current.review_at ? new Date(current.review_at) : null;
  const creditAt = current.estimated_credit_at ? new Date(current.estimated_credit_at) : null;
  if (current.status === "analysis" && reviewAt && now >= reviewAt) {
    return current.will_approve ? "approved" : "refused";
  }
  if (current.status === "approved" && creditAt && now >= creditAt) return "credited";
  if (current.status === "analysis" && creditAt && now >= creditAt) return current.will_approve ? "credited" : "refused";
  return current.status as BonusStatus;
}
