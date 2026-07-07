// lib/googleAuth.js — "Sign in with Google" using Google Identity Services.
//
// This uses Google's modern client-side button (loaded in the nav), which
// hands us a signed ID token. We verify that token here before trusting
// any of the profile info in it. This only needs a Google Client ID (no
// client secret, no OAuth redirect dance) — see README.md for the 5-minute
// setup in Google Cloud Console.

const { OAuth2Client } = require('google-auth-library');

function getClientId() {
  return process.env.GOOGLE_CLIENT_ID || null;
}

function isConfigured() {
  return !!getClientId();
}

async function verifyGoogleToken(idToken) {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not set — Sign in with Google is not configured. See README.md.');
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    name: payload.name,
    email: payload.email,
    picture: payload.picture
  };
}

module.exports = { isConfigured, getClientId, verifyGoogleToken };
