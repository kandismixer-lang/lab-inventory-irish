export async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

export const KIND_LABEL = {
  add: 'รับเข้า', issue: 'เบิก', borrow: 'ยืม', return: 'คืน', adjust: 'ปรับยอด',
  repair: 'ส่งซ่อม', ready: 'พร้อมใช้', lost: 'แจ้งหาย',
};
export const TYPE_LABEL = { tool: 'เครื่องมือ', consumable: 'วัสดุสิ้นเปลือง' };
export const STATUS_LABEL = { available: 'ว่าง', borrowed: 'ถูกยืม', repair: 'ส่งซ่อม', lost: 'หาย' };

// หมวดหมู่ย่อย แบ่งตามพฤติกรรม (tool = ยืม-คืน, consumable = เบิกหมด)
export const CATEGORY_GROUPS = [
  { group: 'ใช้แล้วคืน (ยืม-คืน)', type: 'tool', cats: ['เครื่องมือ', 'ชิ้นส่วน/อุปกรณ์', 'บอร์ด', 'หุ่นยนต์', 'สาย USB (ไม่ตัด)'] },
  { group: 'ใช้แล้วทิ้ง (เบิกหมด)', type: 'consumable', cats: ['สายไฟ', 'วัสดุสิ้นเปลือง', 'สาย USB (ใช้ตัด)'] },
];
export const CATEGORY_TYPE = {};
CATEGORY_GROUPS.forEach((g) => g.cats.forEach((c) => { CATEGORY_TYPE[c] = g.type; }));

// สถานะคำขอ (workflow)
export const REQ_STATUS = {
  pending:   { label: 'กำลังขออนุมัติ', cls: 'st-pending' },
  approved:  { label: 'อนุมัติแล้ว · รอส่งมอบ', cls: 'st-approved' },
  handed:    { label: 'ส่งมอบแล้ว · รอยืนยันรับ', cls: 'st-handed' },
  received:  { label: 'รับแล้ว (ถูกยืม)', cls: 'st-received' },
  returned:  { label: 'คืนแล้ว', cls: 'st-returned' },
  rejected:  { label: 'ถูกปฏิเสธ', cls: 'st-rejected' },
  cancelled: { label: 'ยกเลิก', cls: 'st-cancelled' },
};

// อ่านไฟล์รูป → ย่อขนาด → คืน data URL (JPEG) เพื่อประหยัดพื้นที่/เหมาะมือถือ
export function fileToScaledDataURL(file, maxSide = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSide) { height = Math.round((height * maxSide) / width); width = maxSide; }
      else if (height > maxSide) { width = Math.round((width * maxSide) / height); height = maxSide; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
