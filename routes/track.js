// routes/track.js — customer-facing "Track Your Order" lookup
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/', async (req, res, next) => {
  try {
    const query = (req.query.query || '').trim();
    let order = null;
    let notFound = null;

    if (query) {
      order = await db.findOrderByCode(query.toUpperCase());
      if (!order) notFound = req.query.query;
    }

    const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    res.render('track', { title: 'Track Order', order, notFound, steps });
  } catch (err) { next(err); }
});

module.exports = router;
