// routes/admin.js — the whole admin panel: login, dashboard, live sale,
// products (with image upload), orders (manual tracking ID + invoice), messages, settings
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../lib/db');
const pdf = require('../lib/pdf');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'product-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

// ---- Auth guard: everything below this line requires admin login ----
function requireAdmin(req, res, next) {
  if (req.session.adminLoggedIn) return next();
  res.redirect('/admin/login');
}

// Every admin page gets sidebar badge counts automatically.
router.use(async (req, res, next) => {
  try {
    res.locals.pendingCount = await db.countPendingOrders();
    res.locals.unreadMessages = await db.countUnreadMessages();
    next();
  } catch (err) { next(err); }
});

// ---------------- LOGIN (rate-limited at the server.js level) ----------------
router.get('/login', (req, res) => {
  if (req.session.adminLoggedIn) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Admin Login', error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const ok = await db.checkAdminPassword(req.body.password || '');
    if (ok) {
      req.session.regenerate((err) => { // regenerating on login prevents session-fixation attacks
        if (err) return next(err);
        req.session.adminLoggedIn = true;
        res.redirect('/admin/dashboard');
      });
      return;
    }
    res.render('admin/login', { title: 'Admin Login', error: 'Incorrect password. Try again.' });
  } catch (err) { next(err); }
});

router.get('/logout', (req, res) => {
  req.session.adminLoggedIn = false;
  res.redirect('/');
});

router.use(requireAdmin);

// ---------------- DASHBOARD ----------------
router.get('/dashboard', async (req, res, next) => {
  try {
    const [orders, totalProducts, settings] = await Promise.all([
      db.listOrders(), db.listProducts().then(p => p.length), db.getSettings()
    ]);
    res.render('admin/dashboard', {
      title: 'Dashboard', active: 'dashboard',
      totalOrders: orders.length,
      revenue: orders.filter(o => o.paymentStatus === 'paid').reduce((a, o) => a + o.total, 0),
      totalProducts,
      settings,
      recentOrders: orders.slice(0, 6)
    });
  } catch (err) { next(err); }
});

// ---------------- LIVE SALE ----------------
router.get('/sale', async (req, res, next) => {
  try {
    res.render('admin/sale', { title: 'Live Sale', active: 'sale', settings: await db.getSettings() });
  } catch (err) { next(err); }
});
router.post('/sale/toggle', async (req, res, next) => {
  try { await db.toggleSale(); res.redirect('/admin/sale'); }
  catch (err) { next(err); }
});
router.post('/sale/update', async (req, res, next) => {
  try {
    const discount = Math.min(90, Math.max(1, parseInt(req.body.discountPercent) || 20));
    await db.updateSaleSettings({ saleDiscount: discount, saleText: req.body.bannerText || 'MEGA SALE' });
    res.redirect('/admin/sale');
  } catch (err) { next(err); }
});

// ---------------- PRODUCTS ----------------
router.get('/products', async (req, res, next) => {
  try {
    const products = await db.listProducts({ category: req.query.category, search: req.query.search });
    res.render('admin/products', {
      title: 'Products', active: 'products',
      categories: db.CATEGORIES,
      products, search: req.query.search || '', activeCategory: req.query.category || '',
      message: req.query.message || null
    });
  } catch (err) { next(err); }
});

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', { title: 'Add Product', active: 'products', categories: db.CATEGORIES, product: null });
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.redirect('/admin/products');
    res.render('admin/product-form', { title: 'Edit Product', active: 'products', categories: db.CATEGORIES, product });
  } catch (err) { next(err); }
});

router.post('/products/save', upload.single('imageFile'), async (req, res, next) => {
  try {
    const { id, name, category, price, stock, sizes, description, removeImage } = req.body;
    const data = {
      name,
      category,
      price: parseFloat(price) || 0,
      stock: parseInt(stock) || 0,
      sizes: (sizes || '').split(',').map(s => s.trim()).filter(Boolean),
      description: description || ''
    };

    let product = id ? await db.getProduct(id) : null;
    const isNew = !product;

    if (req.file) {
      if (product && product.image) fs.unlink(path.join(UPLOAD_DIR, product.image), () => {});
      data.image = req.file.filename;
    } else if (removeImage === 'true' && product && product.image) {
      fs.unlink(path.join(UPLOAD_DIR, product.image), () => {});
      data.image = null;
    }

    if (isNew) await db.createProduct(data);
    else await db.updateProduct(id, data);

    res.redirect('/admin/products?message=' + encodeURIComponent(isNew ? 'Product added.' : 'Product updated.'));
  } catch (err) { next(err); }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (product && product.image) fs.unlink(path.join(UPLOAD_DIR, product.image), () => {});
    await db.deleteProduct(req.params.id);
    res.redirect('/admin/products?message=' + encodeURIComponent('Product deleted.'));
  } catch (err) { next(err); }
});

// ---------------- ORDERS (manual tracking ID + invoice) ----------------
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await db.listOrders({ status: req.query.status });
    res.render('admin/orders', {
      title: 'Orders', active: 'orders', orders,
      statuses: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      activeStatus: req.query.status || ''
    });
  } catch (err) { next(err); }
});

router.post('/orders/:id/generate-tracking', async (req, res, next) => {
  try { await db.generateOrderTracking(req.params.id); res.redirect('/admin/orders'); }
  catch (err) { next(err); }
});

router.post('/orders/:id/status', async (req, res, next) => {
  try { await db.setOrderStatus(req.params.id, req.body.status); res.redirect('/admin/orders'); }
  catch (err) { next(err); }
});

router.get('/orders/:id/invoice', async (req, res, next) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.redirect('/admin/orders');
    res.render('admin/invoice', { title: 'Invoice ' + order.orderCode, active: 'orders', order });
  } catch (err) { next(err); }
});

router.get('/orders/:id/invoice/pdf', async (req, res, next) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.redirect('/admin/orders');
    pdf.streamInvoicePdf(order, db.categoryName, res);
  } catch (err) { next(err); }
});

// ---------------- MESSAGES ----------------
router.get('/messages', async (req, res, next) => {
  try { res.render('admin/messages', { title: 'Messages', active: 'messages', messages: await db.listMessages() }); }
  catch (err) { next(err); }
});
router.post('/messages/:id/read', async (req, res, next) => {
  try { await db.markMessageRead(req.params.id); res.redirect('/admin/messages'); }
  catch (err) { next(err); }
});
router.post('/messages/:id/delete', async (req, res, next) => {
  try { await db.deleteMessage(req.params.id); res.redirect('/admin/messages'); }
  catch (err) { next(err); }
});

// ---------------- SETTINGS ----------------
router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'Settings', active: 'settings', error: null, success: null });
});
router.post('/settings/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const ok = await db.checkAdminPassword(currentPassword || '');
    if (!ok) {
      return res.render('admin/settings', { title: 'Settings', active: 'settings', error: 'Current password is incorrect.', success: null });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.render('admin/settings', { title: 'Settings', active: 'settings', error: 'New password must be at least 8 characters.', success: null });
    }
    await db.changeAdminPassword(newPassword);
    res.render('admin/settings', { title: 'Settings', active: 'settings', error: null, success: 'Password updated successfully.' });
  } catch (err) { next(err); }
});

module.exports = router;
