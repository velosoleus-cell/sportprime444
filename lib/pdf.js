// lib/pdf.js — generates a downloadable PDF invoice, mirroring the on-screen
// invoice. No external service or headless browser needed — pdfkit draws
// the PDF directly, so this works the same on any host.

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'logo.png');

function money(n) {
  return '$' + Number(n || 0).toFixed(2);
}

/** Builds the invoice PDF and pipes it straight into the given writable stream (an Express response). */
function streamInvoicePdf(order, categoryName, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderCode}.pdf"`);
  doc.pipe(res);

  // Header
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 50, 45, { width: 40 });
  }
  doc.fontSize(18).fillColor('#111').text('SPORT PRIME', 100, 50);
  doc.fontSize(9).fillColor('#777').text('Performance Sportswear', 100, 72);

  doc.fontSize(9).fillColor('#111').text('INVOICE', 400, 50, { align: 'right' });
  doc.fontSize(9).fillColor('#555').text(new Date(order.date).toLocaleString(), 400, 64, { align: 'right' });

  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#111').lineWidth(1.5).stroke();

  // Bill to / ship to
  doc.fontSize(10).fillColor('#333');
  doc.text(`Bill To: ${order.customer.name}  ·  ${order.customer.phone}${order.customer.email ? '  ·  ' + order.customer.email : ''}`, 50, 115);
  doc.text(`Ship To: ${order.customer.address}`, 50, 132);

  // Order meta box
  const metaY = 155;
  doc.rect(50, metaY, 495, 46).fillAndStroke('#f5f5f5', '#e0e0e0');
  doc.fontSize(9).fillColor('#333');
  doc.text(`Order ID: ${order.orderCode}`, 60, metaY + 8);
  doc.text(`Tracking ID: ${order.trackingId || 'Not yet assigned'}`, 60, metaY + 24);
  doc.text(`Payment: ${order.paymentMethod} (${order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'})`, 300, metaY + 8);
  doc.text(`Status: ${order.status}`, 300, metaY + 24);

  // Line items table
  let y = metaY + 66;
  doc.fontSize(9).fillColor('#666');
  doc.text('ITEM', 50, y);
  doc.text('CATEGORY', 270, y);
  doc.text('QTY', 360, y, { width: 40, align: 'right' });
  doc.text('PRICE', 410, y, { width: 60, align: 'right' });
  doc.text('TOTAL', 480, y, { width: 65, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').lineWidth(1).stroke();
  y += 8;

  doc.fontSize(10).fillColor('#111');
  order.items.forEach(item => {
    const label = item.name + (item.size ? ` (${item.size})` : '');
    doc.text(label, 50, y, { width: 210 });
    doc.text(categoryName(item.category), 270, y, { width: 85 });
    doc.text(String(item.qty), 360, y, { width: 40, align: 'right' });
    doc.text(money(item.price), 410, y, { width: 60, align: 'right' });
    doc.text(money(item.price * item.qty), 480, y, { width: 65, align: 'right' });
    y += 20;
  });

  y += 6;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').lineWidth(1).stroke();
  y += 12;

  if (order.discount > 0) {
    doc.fontSize(10).fillColor('#888').text('Sale Discount', 360, y, { width: 120, align: 'right' });
    doc.fillColor('#e2001a').text('-' + money(order.discount), 480, y, { width: 65, align: 'right' });
    y += 20;
  }

  doc.fontSize(12).fillColor('#111').font('Helvetica-Bold');
  doc.text('Total Paid', 360, y, { width: 120, align: 'right' });
  doc.text(money(order.total), 480, y, { width: 65, align: 'right' });
  doc.font('Helvetica');

  doc.fontSize(9).fillColor('#888').text(
    'Thank you for shopping with Sport Prime. Track your order anytime using your Order ID or Tracking ID.',
    50, 760, { width: 495, align: 'center' }
  );

  doc.end();
}

module.exports = { streamInvoicePdf };
