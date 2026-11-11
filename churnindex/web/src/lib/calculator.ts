import { AUTOPILOT_PRICE, CALCULATOR_SAVE_RATE, FAILED_PAYMENT_SHARE } from "../config";

export interface CalculatorResult {
  lost: number;
  lostYear: number;
  failed: number;
  voluntary: number;
  recoverable: number;
  recoverableYear: number;
  /** Whole multiples of the Autopilot price that the recoverable amount covers. */
  priceMultiple: number;
}

/**
 * Homepage churn calculator (brief section 13):
 * lost = MRR x churn rate; 25% of lost is failed payments; recoverable = lost x 0.30.
 */
export function estimateLeak(mrr: number, churnPercent: number): CalculatorResult {
  const lost = (mrr * churnPercent) / 100;
  const failed = lost * FAILED_PAYMENT_SHARE;
  const recoverable = lost * CALCULATOR_SAVE_RATE;
  return {
    lost,
    lostYear: lost * 12,
    failed,
    voluntary: lost - failed,
    recoverable,
    recoverableYear: recoverable * 12,
    priceMultiple: Math.floor(recoverable / AUTOPILOT_PRICE),
  };
}

export function formatDollars(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
