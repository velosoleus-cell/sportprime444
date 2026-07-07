// routes/cart.js — cart (stored on the session) + checkout via Safepay (online payment only)
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const safepay = require('../lib/safepay');

function cartTotals(cart) {
  const subtotal = cart.reduce((a, c) => a + c.originalPrice * c.qty, 0);
  const total = cart.reduce((a, c) => a + c.price * c.qty, 0);
  return { subtotal, total, discount: subtotal - total, qty: cart.reduce((a, c) => a + c.qty, 0) };
}

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

router.post('/cart/add', async (req, res, next) => {
  try {
    const { productId, size, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity) || 1);
    const product = await db.getProduct(productId);

    if (!product) return res.redirect('/shop');
    if (product.stock <= 0) {
      return res.redirect(`/product/${productId}?error=` + encodeURIComponent('This product is out of stock.'));
    }

    const cart = req.session.cart;
    const chosenSize = size || null;
    const existing = cart.find(c => c.productId === productId && c.size === chosenSize);
    const sale = db.computeSalePrice(product.price, await db.getSettings());

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        productId: product._id.toString(),
        name: product.name,
        category: product.category,
        size: chosenSize,
        qty,
        price: sale,
        originalPrice: product.price
      });
    }
    res.redirect('/cart');
  } catch (err) { next(err); }
});

router.get('/cart', (req, res) => {
  const cart = req.session.cart;
  res.render('cart', { title: 'Your Cart', cart, totals: cartTotals(cart) });
});

router.post('/cart/remove', (req, res) => {
  const index = parseInt(req.body.index);
  if (!isNaN(index)) req.session.cart.splice(index, 1);
  res.redirect('/cart');
});

router.get('/checkout', (req, res) => {
  if (req.session.cart.length === 0) return res.redirect('/cart');
  res.render('checkout', {
    title: 'Checkout', cart: req.session.cart, totals: cartTotals(req.session.cart),
    error: null, paymentsConfigured: safepay.isConfigured()
  });
});

// Creates the order (unpaid, stock reserved) + a Safepay payment session, then redirects to Safepay.
router.post('/checkout', async (req, res, next) => {
  try {
    const cart = req.session.cart;
    if (cart.length === 0) return res.redirect('/cart');

    const { name, phone, email, address } = req.body;
    if (!name || !name.trim() || !phone || !phone.trim() || !address || !address.trim()) {
      return res.render('checkout', {
        title: 'Checkout', cart, totals: cartTotals(cart),
        error: 'Please fill in your name, phone and address.', paymentsConfigured: safepay.isConfigured()
      });
    }

    if (!safepay.isConfigured()) {
      return res.render('checkout', {
        title: 'Checkout', cart, totals: cartTotals(cart),
        error: 'Online payment is not configured yet on this store. Please contact the site owner (see README.md — Safepay keys are missing).',
        paymentsConfigured: false
      });
    }

    const totals = cartTotals(cart);
    const orderCode = await db.nextOrderCode();

    // Tracking ID and invoice are still generated manually by the admin —
    // Safepay only confirms *payment*, not fulfillment/shipping.
    const order = await db.createOrder({
      orderCode,
      trackingId: null,
      customer: { name: name.trim(), phone: phone.trim(), email: (email || '').trim(), address: address.trim() },
      paymentMethod: 'Online Payment (Card)',
      paymentStatus: 'unpaid',
      items: cart.map(c => ({ productId: c.productId, name: c.name, size: c.size, qty: c.qty, price: c.price, category: c.category })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      status: 'Pending'
    });

    // Reserve stock immediately so two customers can't both buy the last item
    // while the first one is still on Safepay's payment page.
    for (const item of cart) {
      await db.reduceStock(item.productId, item.qty);
    }

    try {
      const session = await safepay.createPaymentSession(order, baseUrl(req));
      order.safepayToken = session.token;
      order.safepayTracker = session.tracker;
      await order.save();
      res.redirect(303, session.checkoutUrl);
    } catch (safepayErr) {
      // Safepay itself failed (bad key, network issue, etc.) — undo the stock
      // reservation and cancel the order so nothing is left in a stuck state.
      for (const item of cart) {
        await db.restoreStock(item.productId, item.qty);
      }
      await db.setOrderStatus(order._id, 'Cancelled');
      throw safepayErr;
    }
  } catch (err) { next(err); }
});

// The customer lands here after completing (or attempting) payment on
// Safepay's hosted page. The real confirmation of payment comes from the
// webhook below, which may arrive a moment before or after this page loads —
// so this page reflects whatever payment status is currently on record.
router.get('/checkout/success', async (req, res, next) => {
  try {
    const orderCode = req.query.order;
    const order = await db.findOrderByCode(orderCode);
    if (!order) return res.redirect('/');

    req.session.cart = [];
    res.render('order-confirmation', { title: 'Order Received', order });
  } catch (err) { next(err); }
});

router.get('/checkout/cancel', async (req, res, next) => {
  try {
    const orderCode = req.query.order;
    if (orderCode) {
      const order = await db.findOrderByCode(orderCode);
      if (order && order.paymentStatus === 'unpaid' && order.status !== 'Cancelled') {
        for (const item of order.items) {
          if (item.productId) await db.restoreStock(item.productId, item.qty);
        }
        await db.setOrderStatus(order._id, 'Cancelled');
      }
    }
    res.render('checkout-cancelled', { title: 'Payment Cancelled', orderCode });
  } catch (err) { next(err); }
});

module.exports = router;
