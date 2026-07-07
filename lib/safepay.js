// lib/safepay.js — Safepay Checkout integration for Pakistani businesses.
//
// NOTE ON IMPLEMENTATION: Safepay's official SDK (@sfpy/node-sdk) depends on
// a very outdated version of axios with multiple unpatched high-severity
// vulnerabilities (SSRF, prototype pollution, credential leakage — see
// https://github.com/advisories/GHSA-jr5f-v2jv-69x6 and related). Rather than
// add that to a project that's specifically meant to have a secure admin
// panel, this module calls Safepay's REST API directly using Node's built-in
// fetch (Node 18+), replicating exactly what the official SDK does
// internally. No extra dependency, no known vulnerabilities.
//
// Flow: customer fills the checkout form -> we create a "Pending"/"unpaid"
// order -> we create a Safepay payment session (POST /order/v1/init) ->
// build a checkout URL and redirect the customer to Safepay's hosted payment
// page -> Safepay calls our webhook when payment completes -> we verify the
// webhook signature and mark the order "paid".
//
// You need your own Safepay account for this to work — see README.md.

const crypto = require('crypto');

const ENV = {
  sandbox: {
    api: 'https://sandbox.api.getsafepay.com',
    checkout: 'https://sandbox.api.getsafepay.com/checkout/pay'
  },
  production: {
    api: 'https://api.getsafepay.com',
    checkout: 'https://getsafepay.com/checkout/pay'
  }
};

function getConfig() {
  const apiKey = process.env.SAFEPAY_API_KEY;
  const v1Secret = process.env.SAFEPAY_V1_SECRET;
  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;
  const environment = process.env.SAFEPAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  return { apiKey, v1Secret, webhookSecret, environment };
}

function isConfigured() {
  const { apiKey, v1Secret, webhookSecret } = getConfig();
  return !!(apiKey && v1Secret && webhookSecret);
}

function requireConfig() {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.v1Secret || !cfg.webhookSecret) {
    throw new Error(
      'Safepay is not configured. Create a free account at https://getsafepay.com, grab your Sandbox API Key, ' +
      'Merchant Secret, and Webhook Secret, and add them to .env as SAFEPAY_API_KEY, SAFEPAY_V1_SECRET, and ' +
      'SAFEPAY_WEBHOOK_SECRET. See README.md for the full walkthrough.'
    );
  }
  return cfg;
}

/**
 * Creates a Safepay payment session for the given order total and returns
 * the checkout URL to redirect the customer to.
 *
 * IMPORTANT — amount format: Safepay's own SDK passes the amount straight
 * through to their API with no scaling (unlike Stripe, which wants cents).
 * That's what this code does too — e.g. 45.00 is sent as 45.00, meaning
 * "45 units of the given currency", not "45 cents". This matches the
 * current official SDK's behavior, but since Safepay's public docs are a
 * little inconsistent between their older and newer APIs, please run one
 * small (e.g. $1) sandbox test transaction before going live and confirm
 * the charged amount matches what you expect. If it turns out Safepay
 * actually wants the amount in the smallest currency unit (cents), the fix
 * is a single line: multiply `amount` by 100 in createPaymentSession below.
 */
async function createPaymentSession(order, baseUrl) {
  const cfg = requireConfig();
  const apiBase = ENV[cfg.environment].api;

  const initResponse = await fetch(`${apiBase}/order/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: order.total,
      client: cfg.apiKey,
      currency: 'USD',
      environment: cfg.environment
    })
  });

  if (!initResponse.ok) {
    const text = await initResponse.text().catch(() => '');
    throw new Error(`Safepay session creation failed (${initResponse.status}): ${text}`);
  }

  const body = await initResponse.json();
  const data = body && body.data;
  if (!data || !data.token) {
    throw new Error('Safepay session creation returned an unexpected response (no token).');
  }

  const checkoutUrl = buildCheckoutUrl({
    token: data.token,
    orderId: order.orderCode,
    cancelUrl: `${baseUrl}/checkout/cancel?order=${order.orderCode}`,
    redirectUrl: `${baseUrl}/checkout/success?order=${order.orderCode}`,
    environment: cfg.environment
  });

  return { token: data.token, tracker: data.tracker || null, checkoutUrl };
}

function buildCheckoutUrl({ token, orderId, cancelUrl, redirectUrl, environment }) {
  const base = ENV[environment].checkout;
  const params = new URLSearchParams({
    beacon: token,
    cancel_url: cancelUrl,
    env: environment,
    order_id: orderId,
    redirect_url: redirectUrl,
    source: 'website',
    webhooks: 'true'
  });
  return `${base}?${params.toString()}`;
}

/**
 * Verifies an incoming Safepay webhook request. Safepay signs the `data`
 * field of the webhook body with HMAC-SHA512 using your webhook secret, and
 * sends the signature in the `x-sfpy-signature` header.
 */
function verifyWebhookSignature(req) {
  const cfg = getConfig();
  if (!cfg.webhookSecret) return false;

  const signature = req.headers['x-sfpy-signature'];
  if (!signature || !req.body || typeof req.body.data === 'undefined') return false;

  const payload = Buffer.from(JSON.stringify(req.body.data));
  const expected = crypto.createHmac('sha512', cfg.webhookSecret).update(payload).digest('hex');

  // timing-safe comparison
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isConfigured, createPaymentSession, verifyWebhookSignature };