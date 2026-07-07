// lib/models.js — Mongoose schemas. Using MongoDB (instead of the local
// store.json file) means the app's data now lives in a real cloud database:
// deploy the app anywhere (Render, Railway, Fly.io, a VPS, etc.) and point
// it at a MongoDB Atlas connection string, and the data survives restarts,
// redeploys, and works the same whether you run one server or several.

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['boxing', 'football', 'sportswear'], required: true },
  price: { type: Number, required: true }, // USD
  stock: { type: Number, required: true, default: 0 },
  sizes: { type: [String], default: [] },
  description: { type: String, default: '' },
  image: { type: String, default: null } // filename under public/uploads
}, { timestamps: true });

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: String,
  category: String,
  size: { type: String, default: null },
  qty: Number,
  price: Number
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true },
  trackingId: { type: String, default: null },
  customer: {
    name: String,
    phone: String,
    email: String,
    address: String
  },
  paymentMethod: { type: String, default: 'Online Payment (Card)' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  safepayToken: { type: String, default: null },
  safepayTracker: { type: String, default: null },
  items: { type: [OrderItemSchema], default: [] },
  subtotal: Number,
  discount: Number,
  total: Number,
  status: { type: String, enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'], default: 'Pending' },
  date: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

// Singleton document holding store-wide config + atomic counters for order/tracking numbers.
const SettingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'settings', unique: true },
  adminPasswordHash: { type: String, required: true },
  saleLive: { type: Boolean, default: false },
  saleDiscount: { type: Number, default: 20 },
  saleText: { type: String, default: 'MEGA SALE — LIMITED TIME OFFER' },
  orderSeq: { type: Number, default: 10230 },
  trackSeq: { type: Number, default: 928000 },
  contactPhone: { type: String, default: '923156128612' }, // international format, no +/spaces, for wa.me links
  contactEmail: { type: String, default: 'info@sportprime.com' },
  contactInstagram: { type: String, default: 'https://www.instagram.com/sportsprime442/' }
});

const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Message = mongoose.model('Message', MessageSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = { Product, Order, Message, Settings };
