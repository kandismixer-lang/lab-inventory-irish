// po.js — โมดูลแยก "อ่านใบสั่งซื้อด้วย AI" (MVP)
// ไม่ยุ่งกับลอจิกสต็อก/DB เลย — แค่รับรูปใบสั่งซื้อ (data URL) แล้วให้ Claude ดึงรายการของออกมาเป็น JSON
// ต้องตั้ง env ANTHROPIC_API_KEY ถึงจะใช้ได้ · ไม่ตั้ง = เมนูนี้แค่แจ้งเตือน ส่วนอื่นของระบบไม่กระทบ
// ลบไฟล์นี้ + route /api/po/* ใน server.js + เมนูใน App.jsx = ถอนฟีเจอร์ออกได้สะอาด
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* ยังไม่ได้ npm install @anthropic-ai/sdk */ }

const MODEL = process.env.PO_MODEL || 'claude-sonnet-5'; // สลับเป็น claude-haiku-4-5 เพื่อประหยัดได้

// หมวดต้องตรงกับ CATEGORY_GROUPS ใน client/src/api.js (ให้ AI เลือกหมวดที่ระบบรู้จัก)
const CATEGORIES = [
  'เครื่องมือ', 'ชิ้นส่วน/อุปกรณ์', 'บอร์ด', 'แบตเตอรี่', 'หน่วยความจำ/การ์ด', 'หุ่นยนต์', 'สาย USB (ไม่ตัด)',
  'สายไฟ', 'วัสดุสิ้นเปลือง', 'สาย USB (ใช้ตัด)',
];

// เปิดใช้ได้ไหม (มีทั้ง SDK ที่ลงแล้ว + API key)
function hasKey() {
  return !!Anthropic && !!process.env.ANTHROPIC_API_KEY;
}

// อ่านใบสั่งซื้อจากรูป (data URL) → คืน array ของรายการที่ทำความสะอาดแล้ว
async function parsePurchaseOrder(dataUrl) {
  if (!Anthropic) throw new Error('เซิร์ฟเวอร์ยังไม่ได้ติดตั้ง @anthropic-ai/sdk');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์');
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('รูปไม่ถูกต้อง (ต้องเป็น data URL รูปภาพ)');

  const client = new Anthropic(); // อ่าน ANTHROPIC_API_KEY จาก env อัตโนมัติ
  const prompt =
`นี่คือรูปใบสั่งซื้อ/ใบเสร็จของห้องแลปอิเล็กทรอนิกส์/หุ่นยนต์
ดึงรายการสินค้าออกมาให้ครบ ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่นหรือ markdown
แต่ละชิ้นเป็น object: {"name": ชื่อสินค้า, "qty": จำนวนเป็นตัวเลข, "unit": หน่วย เช่น ชิ้น/ตัว/ม้วน/เส้น, "category": เลือกจาก [${CATEGORIES.join(', ')}] ที่ใกล้เคียงที่สุด, "note": รุ่น/สเปคสั้นๆ ถ้ามี}
กติกา: อ่านจำนวนไม่ชัดให้ใส่ 1 · ไม่แน่ใจหมวดให้ใส่ "ชิ้นส่วน/อุปกรณ์" · เอาเฉพาะรายการสินค้า ไม่เอาค่าส่ง/ภาษี/ยอดรวม`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  // เผื่อโมเดลใส่ ```json ครอบ หรือมีข้อความนำ — ดึงเฉพาะช่วง [ ... ]
  let json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = json.indexOf('['), b = json.lastIndexOf(']');
  if (a >= 0 && b > a) json = json.slice(a, b + 1);
  let items;
  try { items = JSON.parse(json); } catch { throw new Error('AI ตอบไม่เป็น JSON ที่อ่านได้ — ลองถ่ายใหม่ให้ชัดขึ้น'); }
  if (!Array.isArray(items)) throw new Error('รูปแบบข้อมูลจาก AI ไม่ถูกต้อง');

  return items.slice(0, 100).map((it) => ({
    name: String(it.name || '').trim().slice(0, 200),
    qty: Math.max(1, parseInt(it.qty, 10) || 1),
    unit: String(it.unit || 'ชิ้น').trim().slice(0, 20) || 'ชิ้น',
    category: CATEGORIES.includes(it.category) ? it.category : 'ชิ้นส่วน/อุปกรณ์',
    note: String(it.note || '').trim().slice(0, 200),
  })).filter((it) => it.name);
}

module.exports = { parsePurchaseOrder, hasKey, MODEL };
