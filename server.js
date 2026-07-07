// server.js — Sport Prime (Node.js / Express edition)
//
// Setup (see README.md for the full walkthrough):
//   1. Copy .env.example to .env and fill in MONGODB_URI (required),
//      STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY (for online payment),
//      GOOGLE_CLIENT_ID (for Sign in with Google).
//   2. npm install
//   3. npm start
//   4. Open http://localhost:3000

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./lib/db');

const storeRoutes = require('./routes/store');
const cartRoutes = require('./routes/cart');
const contactRoutes = require('./routes/contact');
const trackRoutes = require('./routes/track');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // needed for secure cookies when deployed behind a proxy/load balancer (Render, Railway, etc.)

// Security headers. CSP is relaxed just enough to allow Google's Sign-In
// script/iframe — the only third-party script this app loads on its own
// pages. Safepay's checkout page is a full-page redirect (not embedded), so
// it doesn't need a CSP allowance here.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://accounts.google.com']
    }
  },
  // Helmet's default Cross-Origin-Opener-Policy ("same-origin") blocks the
  // postMessage the Google Sign-In popup uses to hand its result back to
  // this page — it shows the account picker, the user clicks their
  // account, and then the popup just goes blank/white forever. This
  // relaxed setting still isolates the window from cross-origin attacks,
  // but allows popups we open ourselves (like Google's) to talk back to us.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  await db.connect(); // fails fast with a clear message if MONGODB_URI is missing/unreachable

  // Sessions are stored in MongoDB too (not just server memory), so logins
  // and carts survive an app restart and work correctly if you ever run
  // more than one server instance behind a load balancer.
  app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-session-secret-in-.env',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  }));

  // Brute-force protection on the admin login endpoint only.
  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please wait 15 minutes and try again.',
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/admin/login', adminLoginLimiter);

  // Every visitor session gets its own cart, stored right on the session.
  app.use((req, res, next) => {
    if (!req.session.cart) req.session.cart = [];
    next();
  });

  // Make settings/helpers/current user available to every view automatically.
  app.use(async (req, res, next) => {
    try {
      res.locals.settings = await db.getSettings();
      res.locals.categoryName = db.categoryName;
      res.locals.categoryIconSvg = db.categoryIconSvg;
      res.locals.money = (n) => '$' + Number(n || 0).toFixed(2);
      res.locals.user = req.session.user || null;
      res.locals.googleClientId = process.env.GOOGLE_CLIENT_ID || null;
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/', storeRoutes);
  app.use('/', cartRoutes);
  app.use('/contact', contactRoutes);
  app.use('/track', trackRoutes);
  app.use('/admin', adminRoutes);
  app.use('/auth', authRoutes);
  app.use('/webhooks', webhookRoutes);

  app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    const message = err.message || 'Something went wrong. Please try again.';
    res.status(500).render('error', { title: 'Something Went Wrong', message });
  });

  // Binding to 0.0.0.0 (not just "localhost") is required by most cloud
  // hosting platforms (Bonto, Render, Railway, etc.) — otherwise the server
  // runs fine internally but is unreachable from their preview/proxy layer.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sport Prime running at http://localhost:${PORT}`);
    console.log(`Admin panel:            http://localhost:${PORT}/admin/login`);
  });
}

start().catch(err => {
  console.error('Failed to start Sport Prime:\n');
  console.error(err.message);
  process.exit(1);
});