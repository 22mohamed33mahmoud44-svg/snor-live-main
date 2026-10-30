// Validate untrusted checkout input before it can reach the Stripe API.
// Do not use dynamic object lookup without an explicit own-key allowlist.
export const PACKAGE_IDS = Object.freeze(['pkg_100', 'pkg_500', 'pkg_1000']);

export function parseCheckoutPackage(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const packageId = payload.packageId;
  return typeof packageId === 'string' && PACKAGE_IDS.includes(packageId)
    ? packageId
    : null;
}

export function resolveCheckoutPrice(packageId, prices) {
  if (typeof packageId !== 'string' || !PACKAGE_IDS.includes(packageId) ||
      !Object.prototype.hasOwnProperty.call(prices, packageId)) {
    return null;
  }
  const price = prices[packageId];
  return typeof price === 'string' && price.trim().length > 0 ? price : null;
}

export function buildCheckoutRedirects(appUrl) {
  const url = new URL(appUrl);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) ||
      url.username || url.password) {
    throw new Error('Invalid configured app origin');
  }
  // Stripe must receive the unescaped, literal placeholder in success_url.
  const origin = url.origin;
  return {
    successUrl: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/?payment=cancelled`,
  };
}

/**
 * Return the actual checkout amount quoted by Stripe, not a UI price guess.
 * Reject missing totals rather than letting the browser display an invented amount.
 */
export function checkoutDisplayDetails(session) {
  const amount = session?.amount_total;
  const currency = session?.currency;
  const checkoutUrl = session?.url;
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency) ||
      typeof checkoutUrl !== 'string') {
    return null;
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(checkoutUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    return null;
  }
  return {
    session_id: session.id,
    checkout_url: checkoutUrl,
    amount_total: amount,
    currency: currency.toUpperCase(),
  };
}
