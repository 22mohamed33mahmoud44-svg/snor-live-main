// Pure credit gate. A Stripe signature confirms the event is from Stripe,
// but its metadata alone does not prove which price was purchased.
// Call this ONLY after verifying Stripe's webhook signature and fetching the
// actual Checkout Session line items via the Stripe API.
export const PACKAGE_COINS = Object.freeze({
  pkg_100: 100,
  pkg_500: 500,
  pkg_1000: 1000,
});

const VALID_USER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function validatePaidCoinCheckout(session, lineItems, configuredPrices) {
  const packageId = session?.metadata?.package_id;
  const userId = session?.metadata?.user_id;

  if (typeof packageId !== 'string' ||
      !Object.prototype.hasOwnProperty.call(PACKAGE_COINS, packageId) ||
      typeof userId !== 'string' || !VALID_USER_ID.test(userId)) {
    return null;
  }

  const expectedPrice = configuredPrices?.[packageId];
  if (typeof expectedPrice !== 'string' || !expectedPrice.startsWith('price_')) {
    return null;
  }

  // A new session includes client_reference_id. Older sessions created by
  // the previous Checkout function may omit it, but must still pass the
  // signed Stripe event + purchased-price verification below.
  if (session.client_reference_id != null &&
      session.client_reference_id !== userId) {
    return null;
  }

  if (typeof session.id !== 'string' || !session.id.startsWith('cs_') ||
      session.mode !== 'payment' || session.payment_status !== 'paid' ||
      !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0) {
    return null;
  }

  const items = lineItems?.data;
  if (!Array.isArray(items) || items.length !== 1 || lineItems.has_more !== false) {
    return null;
  }

  const item = items[0];
  const unitAmount = item?.price?.unit_amount;
  if (item?.price?.id !== expectedPrice ||
      item?.quantity !== 1 ||
      !Number.isSafeInteger(unitAmount) || unitAmount <= 0 ||
      !Number.isSafeInteger(item.amount_total) ||
      item.amount_total < unitAmount ||
      session.amount_total < item.amount_total) {
    return null;
  }

  // Fulfill only the exact package paid for, never a count supplied by metadata.
  return {
    userId,
    packageId,
    coins: PACKAGE_COINS[packageId],
    sessionId: session.id,
  };
}
