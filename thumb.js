// ทำรูปย่อ (thumbnail) จากรูปของที่เก็บเป็น data URL — ใช้ในหน้า Stock ที่แสดงรูปแค่ 64px
// ใช้ jpeg-js (pure JS) ไม่ใช่ sharp — ไม่ต้อง build native บน Render
// รับเฉพาะ JPEG (client ย่อ+แปลงทุกรูปเป็น JPEG ก่อนส่งอยู่แล้ว) อย่างอื่นคืน '' = ใช้รูปเต็มแทน
const jpeg = require('jpeg-js');

const SHORT_SIDE = 160; // ด้านสั้น 160px — รูปย่อแสดง 64×64 (object-fit: cover) คมพอบนจอมือถือ 2.5x
const QUALITY = 72;

// ย่อแบบเฉลี่ยพื้นที่ (box filter) — ย่อหลายเท่าแล้วไม่แตกเป็นจุดเหมือน nearest-neighbor
function boxResize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * sw + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) { r += src[p]; g += src[p + 1]; b += src[p + 2]; n++; }
      }
      const o = (y * dw + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
  }
  return out;
}

/** @returns {string} data URL ของรูปย่อ หรือ '' ถ้าทำไม่ได้ (ไม่ใช่ JPEG / ไฟล์เสีย) */
function makeThumb(dataUrl) {
  const m = /^data:image\/jpe?g;base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return '';
  try {
    const img = jpeg.decode(Buffer.from(m[1], 'base64'), { useTArray: true, maxMemoryUsageInMB: 128 });
    const scale = SHORT_SIDE / Math.min(img.width, img.height);
    if (scale >= 1) return ''; // เล็กอยู่แล้ว ใช้รูปเต็มได้เลย
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const data = boxResize(img.data, img.width, img.height, w, h);
    return 'data:image/jpeg;base64,' + jpeg.encode({ data, width: w, height: h }, QUALITY).data.toString('base64');
  } catch {
    return '';
  }
}

module.exports = { makeThumb };
