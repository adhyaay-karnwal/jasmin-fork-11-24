/**
 * Jasmine Cloud rates. One place, so the cards, the calculator and the dashboard
 * can't disagree. Must match cloud/gateway/src/config.mjs, which does the billing.
 */
export const RATES = {
  vcpuHour: 0.0045,
  gibHour: 0.0015,
  storageGibMonth: 0.05,
  /** One-time, per account, no card needed. */
  trialCredit: 2,
  topUps: [10, 25, 100],
};
/** The machine the headline price is quoted for. */
export const STD = { vcpus: 4, gib: 8 };
export const stdHour = () => STD.vcpus * RATES.vcpuHour + STD.gib * RATES.gibHour;

export const usd = (n: number, digits = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
