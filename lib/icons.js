// lib/icons.js
//
// Real line-art SVG icons for each fixed category — used everywhere the
// site used to show an emoji (category cards, filter chips, product media
// placeholder, admin thumbnails). All icons use currentColor so they pick
// up whatever color is set on their wrapper via CSS.

const boxingGlove = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22 10c-6 0-11 5-11 11v9c0 3 1 5 3 7l2 2v9c0 4 3 7 7 7h14c4 0 7-3 7-7v-6l6-6c2-2 3-5 3-8v-7c0-6-5-11-11-11h-2c-2-3-5-5-9-5h-3c-2 0-4 1-6 2z" fill="currentColor" opacity="0.15"/>
  <path d="M22 10c-6 0-11 5-11 11v9c0 3 1 5 3 7l2 2v9c0 4 3 7 7 7h14c4 0 7-3 7-7v-6l6-6c2-2 3-5 3-8v-7c0-6-5-11-11-11h-2c-2-3-5-5-9-5h-3c-2 0-4 1-6 2z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M16 30v-9a6 6 0 0 1 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M27 48h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

const americanFootball = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="32" cy="32" rx="24" ry="14" transform="rotate(-32 32 32)" fill="currentColor" opacity="0.15"/>
  <ellipse cx="32" cy="32" rx="24" ry="14" transform="rotate(-32 32 32)" stroke="currentColor" stroke-width="2.5"/>
  <path d="M20 32 L44 32" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" transform="rotate(-32 32 32)"/>
  <path d="M26 28v8M30 26v12M34 24v16M38 22v20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" transform="rotate(-32 32 32)"/>
</svg>`;

const sportswear = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22 8 L10 16l4 8 6-3v29a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V21l6 3 4-8-12-8-4 4h-8z" fill="currentColor" opacity="0.15"/>
  <path d="M22 8 L10 16l4 8 6-3v29a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V21l6 3 4-8-12-8-4 4h-8z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M26 8c1 3 3 5 6 5s5-2 6-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

const ICONS = { boxing: boxingGlove, football: americanFootball, sportswear };

function categoryIconSvg(categoryId, size) {
  const svg = ICONS[categoryId] || sportswear;
  const px = size || 32;
  return svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
}

module.exports = { categoryIconSvg };
