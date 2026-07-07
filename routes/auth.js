// routes/auth.js — customer-facing "Sign in with Google"
const express = require('express');
const router = express.Router();
const googleAuth = require('../lib/googleAuth');

// Called by the Google Sign-In button's JS callback with the ID token credential.
router.post('/google/callback', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    const profile = await googleAuth.verifyGoogleToken(credential);
    req.session.user = profile;
    res.json({ ok: true, name: profile.name });
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    res.status(401).json({ error: 'Sign-in failed. Please try again.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.user = null;
  res.redirect(req.get('Referer') || '/');
});

module.exports = router;
