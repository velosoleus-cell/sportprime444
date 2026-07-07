# Sport Prime — Node.js (Express) Edition

Sport Prime's sportswear store — storefront, admin panel, online payment via
Safepay, Google sign-in, PDF invoices — built with Node.js and Express,
backed by a cloud database (MongoDB Atlas) so it's ready to deploy anywhere.

## What's in this version

- **Cloud database** — MongoDB (via Mongoose) instead of a local file. Deploy
  the app anywhere and it keeps working; data survives restarts and redeploys.
- **Online payment only, via Safepay** — a Pakistan-based payment gateway
  supporting Visa, Mastercard, and other major cards. No cash on delivery.
- **Sign in with Google** — customers can sign in; their name/email
  pre-fills at checkout.
- **Prices in USD.**
- **Real category icons** (clean line-art SVGs) instead of emoji.
- **Click-to-WhatsApp, click-to-email, and Instagram links** on the Contact page.
- **Downloadable PDF invoices**, plus the existing print option.
- **A more secure admin panel**: passwords are hashed (bcrypt), login
  attempts are rate-limited, security headers are set (Helmet), and sessions
  are stored in MongoDB rather than server memory.

Tracking IDs and invoices are still generated **manually by the admin** —
Safepay only confirms payment, not fulfillment. That part of the workflow is
unchanged from before.

## Requirements

- **Node.js 18 or newer**
- A **free MongoDB Atlas account** (cloud database — no local install needed)
- A **free Safepay account** (for online payment)
- A **Google Cloud project** (for Sign in with Google) — optional; the site
  works fine without it, the Google button just won't appear

## Setup

### 1. Install dependencies
```bash
cd sportprime-node
npm install
```

### 2. Create your `.env` file
```bash
cp .env.example .env
```
You'll fill in the values below as you go.

### 3. MongoDB Atlas (required)
1. Sign up free: https://www.mongodb.com/cloud/atlas/register
2. Create a free **M0 cluster** (any provider/region is fine).
3. **Database Access** → add a database user (username + password — avoid
   special characters like `@` or `/` in the password, or URL-encode them).
4. **Network Access** → add IP address `0.0.0.0/0` (allow from anywhere) —
   fine for getting started; tighten this later for production.
5. **Database → Connect → Drivers** → copy the connection string. It looks like:
   `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Paste it into `.env` as `MONGODB_URI`, and add a database name before the
   `?`, e.g. `.../sportprime?retryWrites=true...`.

**If you're seeing a MongoDB connection error**, it's almost always one of:
- **IP not whitelisted** — go to Network Access and confirm `0.0.0.0/0` (or
  your actual IP) is listed and shows "Active".
- **Wrong username/password** — re-check Database Access; if your password
  has special characters, URL-encode them (e.g. `@` becomes `%40`).
- **Missing database name** — make sure there's a `/sportprime` (or any
  name) between `.net` and the `?` in the connection string.
- **Cluster still provisioning** — a brand-new free cluster can take a
  couple of minutes to become reachable after creation.

Run `npm start` and read the exact error message in the terminal — this app
prints a clear, specific reason rather than a generic crash.

### 4. Safepay (required for checkout to work)
1. Sign up free: https://getsafepay.com
2. From your Dashboard, go to **Developers** and grab three values (use the
   **Sandbox** versions while testing):
   - **API Key** (starts with `sec_...`) → `SAFEPAY_API_KEY`
   - **Merchant Secret** → `SAFEPAY_V1_SECRET`
   - **Webhook Secret** → `SAFEPAY_WEBHOOK_SECRET` (you'll set this up when
     you configure a webhook endpoint — step 5 below)
3. Set `SAFEPAY_ENVIRONMENT=sandbox` in `.env` while testing.

**Setting up the webhook** (this is how the app finds out a payment
succeeded):
1. In your Safepay Dashboard, find **Webhooks** and add an endpoint URL:
   `https://YOUR-DOMAIN/webhooks/safepay`
2. While testing locally, your computer doesn't have a public URL yet — use
   a free tunnel tool like **ngrok**:
   ```bash
   npx ngrok http 3000
   ```
   This gives you a temporary public URL (e.g. `https://abc123.ngrok.app`).
   Use `https://abc123.ngrok.app/webhooks/safepay` as your webhook URL in
   the Safepay dashboard, **and** set `BASE_URL=https://abc123.ngrok.app` in
   your `.env` for that test session (so Safepay's redirect links point
   back to the tunnel too).
3. Once deployed to a real host, just use your real domain instead — no
   tunnel needed at that point.

**Testing a payment:**
1. Run `npm start`, add something to your cart, and check out.
2. You'll land on Safepay's sandbox payment page — use their documented
   sandbox/test card numbers (check your Safepay Dashboard's sandbox
   documentation for the current test card list).
3. Watch your terminal — the webhook handler logs the full payload it
   receives from Safepay on every call. **Check this on your first test**:
   if the order doesn't get marked "paid" automatically, the printed
   payload will show you the actual field names Safepay used, so you (or I)
   can adjust `routes/webhooks.js` to match exactly.
4. As a manual fallback, you can always cross-check a payment directly in
   your Safepay Dashboard before shipping an order, and the admin panel
   lets you update order status regardless of what the webhook did.

When you're ready to accept real payments: complete Safepay's merchant
verification (they'll ask for business/bank details per State Bank of
Pakistan requirements), switch `SAFEPAY_ENVIRONMENT=production`, and swap in
your production keys.

### 5. Google Sign-In (optional)
1. Go to https://console.cloud.google.com/ → create a project (or use an existing one).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
3. Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:3000`
   (and your real domain once you deploy).
5. Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID`. (No client
   secret needed.)

If you skip this step, the site works completely normally — the Google
button simply doesn't appear in the nav.

### 6. Run it
```bash
npm start
```
Open **http://localhost:3000**.

- **Admin panel:** http://localhost:3000/admin/login
- **Default admin password:** whatever you set as `ADMIN_INITIAL_PASSWORD`
  in `.env` (defaults to `sportprime2026`). This is only used the very first
  time the app runs, to create the admin account — change it from
  **Admin → Settings** right after logging in.

## How the site is organized

```
server.js            → wires everything together (security, sessions, routes)
lib/
  models.js          → MongoDB schemas (Product, Order, Message, Settings)
  db.js              → all database access — routes never touch Mongoose directly
  safepay.js         → Safepay Checkout integration (via direct API calls)
  googleAuth.js      → verifies Google Sign-In tokens
  pdf.js             → generates downloadable PDF invoices
  icons.js           → real SVG icons for the 3 categories
routes/
  store.js           → home, shop listing, product detail
  cart.js            → cart + checkout + Safepay redirect handling
  contact.js         → Contact Us form → admin inbox
  track.js           → "Track Your Order" lookup
  admin.js           → the whole admin panel
  auth.js            → Google Sign-In endpoint
  webhooks.js        → receives payment confirmation from Safepay
views/               → storefront pages (EJS)
views/admin/         → admin panel pages
public/              → CSS, logo, uploaded product images
```

## What's fixed by design (per your requirements)

- **Only 3 categories** — Boxing Gloves, American Football, Sportswear —
  hardcoded in `lib/db.js`, so the admin can only ever choose from those three.
- **Products can only be added/edited from the admin panel**, with image
  upload (JPG/PNG) via the product form.
- **Online payment only.** The checkout form has no payment-method choice —
  it always goes through Safepay.
- **Tracking IDs and invoices are generated manually** by the admin under
  **Orders** — a "+ Generate ID" button issues the tracking number, and the
  🧾 icon opens the invoice (with a Print button and a Download PDF button).
- **Contact page** has a real WhatsApp link (opens a chat with
  +923156128612), a `mailto:` email link, and a link to
  instagram.com/sportsprime442.

## About the Safepay integration specifically

Safepay's official Node SDK (`@sfpy/node-sdk`) depends on a very outdated
version of `axios` with multiple unpatched high-severity vulnerabilities
(SSRF, prototype pollution, credential leakage). Since this project is
specifically meant to have a secure admin panel, `lib/safepay.js` calls
Safepay's REST API directly using Node's built-in `fetch` instead —
replicating exactly what the official SDK does internally, with zero known
vulnerabilities and no extra dependency.

One honest caveat: Safepay's public documentation is a little inconsistent
about the exact webhook payload field names between their older and newer
APIs. `routes/webhooks.js` logs the full payload it receives on every call
specifically so you can check your first real test transaction and confirm
(or correct) the field names it's matching against. This is called out
clearly in the setup steps above.

## Security notes

- Admin passwords are hashed with **bcrypt** — never stored in plain text.
- The admin login endpoint is **rate-limited** (10 attempts per 15 minutes
  per IP).
- **Helmet** sets standard security headers (CSP, etc.).
- Sessions are stored in MongoDB (via `connect-mongo`), not server memory.
- Session cookies are `httpOnly` always, and `secure` (HTTPS-only) when
  `NODE_ENV=production`.
- Safepay payments are confirmed via a **cryptographically signed webhook**
  (HMAC-SHA512), not by trusting the customer's browser redirect alone.
- For production: restrict the MongoDB Atlas Network Access list instead of
  `0.0.0.0/0`, and put the app behind HTTPS (most hosts like Render/Railway
  handle this automatically).

## Deploying

Because everything lives in MongoDB Atlas (not a local file), this app can
be deployed to any Node hosting platform — Render, Railway, Fly.io, a VPS,
etc. Set the same environment variables from `.env` in your host's
dashboard, update `BASE_URL` to your real domain, and update the Safepay
webhook URL and Google authorized origin to match.

## If something goes wrong

Run `npm start` and read the error message in the terminal — this app is
written to fail with a clear explanation rather than a cryptic crash. If you
get stuck, copy the exact error text and ask for help.
