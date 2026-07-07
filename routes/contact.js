// routes/contact.js — Contact Us form, saves straight into the admin inbox
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/', (req, res) => {
  res.render('contact', { title: 'Contact Us', message: null, error: null });
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !name.trim() || !email || !email.trim() || !message || !message.trim()) {
      return res.render('contact', { title: 'Contact Us', message: null, error: 'Please fill in all fields.' });
    }
    await db.createMessage({ name: name.trim(), email: email.trim(), message: message.trim() });
    res.render('contact', { title: 'Contact Us', message: 'Message sent! We will get back to you soon.', error: null });
  } catch (err) { next(err); }
});

module.exports = router;
