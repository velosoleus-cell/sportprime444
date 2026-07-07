// lib/db.js — the app's data-access layer. Every route talks to this file
// instead of touching Mongoose models directly, so the storage engine can
// change later without touching route code.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Product, Order, Message, Settings } = require('./models');
const { categoryIconSvg } = require('./icons');

const CATEGORIES = [
  { id: 'boxing', name: 'Boxing Gloves' },
  { id: 'football', name: 'American Football' },
  { id: 'sportswear', name: 'Sportswear' }
];

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Create a free MongoDB Atlas cluster (https://www.mongodb.com/cloud/atlas/register), ' +
      'copy its connection string into your .env file as MONGODB_URI, and restart the app. See README.md for the full walkthrough.'
    );
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await seedIfEmpty();
}

async function seedIfEmpty() {
  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany([
      prod('Pro Contender Boxing Gloves', 'boxing', 45, 24, 'S, M, L', 'Genuine leather sparring gloves with multi-layer foam padding for maximum wrist support and shock absorption.'),
      prod('Heavy Punching Bag 4ft', 'boxing', 120, 10, '', 'Unfilled heavy-duty synthetic leather bag, reinforced stitching, built for daily power training.'),
      prod('Hand Wraps 180" (Pair)', 'boxing', 8, 60, '', 'Elastic cotton hand wraps for wrist and knuckle protection during training and sparring.'),
      prod('Elite Shoulder Pads', 'football', 85, 14, 'M, L, XL', 'Impact-rated shoulder pads with adjustable straps for linemen and skill positions.'),
      prod('Gridiron Helmet Pro', 'football', 150, 8, 'M, L, XL', 'Certified hard-shell helmet with impact-absorbing liner and adjustable face cage.'),
      prod('American Football Jersey', 'football', 35, 35, 'S, M, L, XL, XXL', 'Breathable mesh jersey built for game-day durability with reinforced number panels.'),
      prod('Match Football Jersey Kit', 'sportswear', 32, 40, 'S, M, L, XL', 'Full jersey and shorts kit in breathable moisture-wicking fabric, customizable numbering.'),
      prod('Pro Match Football', 'sportswear', 28, 50, '', 'FIFA-spec size 5 hand-stitched match ball with textured surface for control.'),
      prod('Compression Training Tee', 'sportswear', 18, 45, 'S, M, L, XL, XXL', 'Sweat-wicking compression base layer for training sessions in any weather.')
    ]);
  }

  const existingSettings = await Settings.findOne({ singleton: 'settings' });
  if (!existingSettings) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'sportprime2026';
    const hash = await bcrypt.hash(initialPassword, 10);
    await Settings.create({ singleton: 'settings', adminPasswordHash: hash });
    console.log(`No admin account found — created one with the password from ADMIN_INITIAL_PASSWORD (or the default "sportprime2026" if you didn't set one). Change it under Settings after logging in.`);
  }
}

function prod(name, category, price, stock, sizes, description) {
  return {
    name, category, price, stock,
    sizes: sizes ? sizes.split(',').map(s => s.trim()).filter(Boolean) : [],
    description, image: null
  };
}

// ---------------- settings ----------------
async function getSettings() {
  return Settings.findOne({ singleton: 'settings' });
}
async function updateSaleSettings({ saleDiscount, saleText }) {
  return Settings.updateOne({ singleton: 'settings' }, { saleDiscount, saleText });
}
async function toggleSale() {
  const s = await getSettings();
  s.saleLive = !s.saleLive;
  await s.save();
  return s;
}
async function checkAdminPassword(password) {
  const s = await getSettings();
  return bcrypt.compare(password, s.adminPasswordHash);
}
async function changeAdminPassword(newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  await Settings.updateOne({ singleton: 'settings' }, { adminPasswordHash: hash });
}
async function salePrice(price) {
  const s = await getSettings();
  return computeSalePrice(price, s);
}
function computeSalePrice(price, settings) {
  if (settings && settings.saleLive) return Math.round(price * (1 - settings.saleDiscount / 100) * 100) / 100;
  return price;
}
async function nextOrderCode() {
  const s = await Settings.findOneAndUpdate(
    { singleton: 'settings' }, { $inc: { orderSeq: 1 } }, { new: true }
  );
  return 'SP-' + s.orderSeq;
}
async function nextTrackingId() {
  const bump = Math.floor(Math.random() * 900) + 100;
  const s = await Settings.findOneAndUpdate(
    { singleton: 'settings' }, { $inc: { trackSeq: bump } }, { new: true }
  );
  return 'TRK-' + s.trackSeq;
}

// ---------------- products ----------------
async function listProducts({ category, search } = {}) {
  const query = {};
  if (category) query.category = category;
  if (search) query.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return Product.find(query).sort({ createdAt: -1 });
}
async function getProduct(id) {
  return Product.findById(id);
}
async function createProduct(data) {
  return Product.create(data);
}
async function updateProduct(id, data) {
  return Product.findByIdAndUpdate(id, data, { new: true });
}
async function deleteProduct(id) {
  return Product.findByIdAndDelete(id);
}
async function reduceStock(id, qty) {
  await Product.updateOne({ _id: id }, { $inc: { stock: -qty } });
  await Product.updateOne({ _id: id, stock: { $lt: 0 } }, { stock: 0 });
}
async function restoreStock(id, qty) {
  await Product.updateOne({ _id: id }, { $inc: { stock: qty } });
}

// ---------------- orders ----------------
async function createOrder(data) {
  return Order.create(data);
}
async function listOrders({ status } = {}) {
  const query = {};
  if (status) query.status = status;
  return Order.find(query).sort({ date: -1 });
}
async function getOrder(id) {
  return Order.findById(id);
}
async function findOrderByCode(code) {
  return Order.findOne({ $or: [{ orderCode: code }, { trackingId: code }] });
}
async function setOrderStatus(id, status) {
  return Order.findByIdAndUpdate(id, { status }, { new: true });
}
async function generateOrderTracking(id) {
  const trackingId = await nextTrackingId();
  const order = await Order.findById(id);
  if (!order) return null;
  order.trackingId = trackingId;
  if (order.status === 'Pending') order.status = 'Processing';
  await order.save();
  return order;
}
async function markOrderPaid(id) {
  return Order.findByIdAndUpdate(id, { paymentStatus: 'paid' }, { new: true });
}
async function countPendingOrders() {
  return Order.countDocuments({ status: 'Pending' });
}

// ---------------- messages ----------------
async function createMessage(data) {
  return Message.create(data);
}
async function listMessages() {
  return Message.find().sort({ date: -1 });
}
async function markMessageRead(id) {
  return Message.findByIdAndUpdate(id, { read: true });
}
async function deleteMessage(id) {
  return Message.findByIdAndDelete(id);
}
async function countUnreadMessages() {
  return Message.countDocuments({ read: false });
}

function categoryName(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.name : id;
}

module.exports = {
  CATEGORIES,
  connect,
  categoryName,
  categoryIconSvg,
  salePrice, computeSalePrice,
  getSettings, updateSaleSettings, toggleSale, checkAdminPassword, changeAdminPassword,
  nextOrderCode, nextTrackingId,
  listProducts, getProduct, createProduct, updateProduct, deleteProduct, reduceStock, restoreStock,
  createOrder, listOrders, getOrder, findOrderByCode, setOrderStatus, generateOrderTracking, markOrderPaid, countPendingOrders,
  createMessage, listMessages, markMessageRead, deleteMessage, countUnreadMessages
};
