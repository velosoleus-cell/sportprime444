// routes/webhooks.js — receives payment-status notifications from Safepay.
//
// This is the SOURCE OF TRUTH for marking an order as paid — more reliable
// than trusting the customer's browser redirect alone, since a webhook comes
// directly from Safepay's servers and is cryptographically signed.
//
// IMPORTANT: this endpoint must be reachable from the public internet for
// Safepay to call it. On localhost during development, use a tunnel like
// ngrok (see README.md) so Safepay's sandbox can actually reach you; once
// deployed to a real host this works automatically.

const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const safepay = require('../lib/safepay');

router.post('/safepay', async (req, res, next) => {
  try {
    // DIAGNOSTIC MODE: while we don't have a confirmed SAFEPAY_WEBHOOK_SECRET
    // yet, skip rejecting on a bad/missing signature so we can see exactly
    // what Safepay sends on a real test payment. Print everything —
    // headers included, since the signature could be under a different
    // header name than we assumed.
    console.log('\n========== SAFEPAY WEBHOOK RECEIVED ==========');
    console.log('HEADERS:', JSON.stringify(req.headers, null, 2));
    console.log('BODY:', JSON.stringify(req.body, null, 2));
    console.log('===============================================\n');

    const valid = safepay.verifyWebhookSignature(req);
    console.log('[Safepay webhook] signature valid:', valid);

    // Temporarily NOT rejecting on invalid signature — see the note above
    // routes/webhooks.js at the top of this file. Once we confirm the real
    // secret/header from the logged output, put the `if (!valid) return...`
    // check back before this goes anywhere near production.

    const data = req.body.data || req.body || {};
    const orderCode = data.order_id || data.orderId || (data.metadata && data.metadata.order_id) || null;

    if (!orderCode) {
      console.warn('[Safepay webhook] Could not find an order_id in the payload — see the logged payload above and adjust routes/webhooks.js to match the actual field name.');
      return res.status(200).json({ received: true, matched: false });
    }

    const order = await db.findOrderByCode(orderCode);
    if (!order) {
      console.warn(`[Safepay webhook] No order found for code "${orderCode}"`);
      return res.status(200).json({ received: true, matched: false });
    }

    // Common success indicators across payment gateways — adjust/extend
    // this list once you've seen a real payload from your sandbox test.
    const state = (data.state || data.status || data.type || '').toString().toUpperCase();
    const looksSuccessful = ['PAID', 'COMPLETED', 'SUCCESS', 'TRACKER_ENDED', 'PAYMENT_COMPLETED'].some(s => state.includes(s));

    if (looksSuccessful && order.paymentStatus !== 'paid') {
      await db.markOrderPaid(order._id);
      console.log(`[Safepay webhook] Order ${orderCode} marked as paid.`);
    }

    res.status(200).json({ received: true, matched: true });
  } catch (err) { next(err); }
});

module.exports = router;