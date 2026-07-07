// routes/store.js — public storefront: home page, shop listing, product detail
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/', async (req, res, next) => {
  try {
    res.render('index', { title: 'Home', categories: db.CATEGORIES });
  } catch (err) { next(err); }
});

router.get('/shop', async (req, res, next) => {
  try {
    const activeCategory = req.query.category || null;
    const [products, settings] = await Promise.all([
      db.listProducts({ category: activeCategory, search: req.query.search }),
      db.getSettings()
    ]);
    const productsWithPrice = products.map(p => ({ p, sale: db.computeSalePrice(p.price, settings) }));

    res.render('shop', {
      title: 'Shop',
      categories: db.CATEGORIES,
      productsWithPrice,
      activeCategory,
      search: req.query.search || ''
    });
  } catch (err) { next(err); }
});

router.get('/product/:id', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).render('404', { title: 'Product Not Found' });

    res.render('product-detail', {
      title: product.name,
      product,
      salePriceValue: db.computeSalePrice(product.price, res.locals.settings),
      error: req.query.error || null
    });
  } catch (err) { next(err); }
});

module.exports = router;
