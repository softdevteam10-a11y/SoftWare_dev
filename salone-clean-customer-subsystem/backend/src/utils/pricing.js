// ============================================================================
// pricing.js — Single source of truth for service tiers, token counts, and
// price-per-bundle in New Leones (SLE). Kept server-side so the client can
// never manipulate the price of a purchase — the frontend only ever DISPLAYS
// a live estimate; the backend recomputes and trusts only its own numbers.
// ============================================================================

const SERVICE_TIERS = Object.freeze({
  small: { label: 'Small', tokensPerUnit: 1, priceSLE: 50 },
  medium: { label: 'Medium', tokensPerUnit: 5, priceSLE: 225 },
  large: { label: 'Large', tokensPerUnit: 10, priceSLE: 400 },
});

/**
 * @param {'small'|'medium'|'large'} tier
 * @param {number} quantity - positive integer
 * @returns {{tokens:number, unitPrice:number, totalPrice:number}|null}
 */
function calculatePurchase(tier, quantity) {
  const tierConfig = SERVICE_TIERS[tier];
  if (!tierConfig || !Number.isInteger(quantity) || quantity <= 0) return null;

  return {
    tokens: tierConfig.tokensPerUnit * quantity,
    unitPrice: tierConfig.priceSLE,
    totalPrice: Number((tierConfig.priceSLE * quantity).toFixed(2)),
  };
}

module.exports = { SERVICE_TIERS, calculatePurchase };
