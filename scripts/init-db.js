// สร้าง admin คนแรก + ข้อมูลตัวอย่าง
const bcrypt = require('bcryptjs');
const db = require('../db');

const username = process.env.ADMIN_USER || 'admin';
const password = process.env.ADMIN_PASS || 'admin1234';

const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (exists) {
  console.log(`มี user "${username}" อยู่แล้ว — ข้ามการสร้าง admin`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password, fullname, role) VALUES (?, ?, ?, 'admin')"
  ).run(username, hash, 'ผู้ดูแลระบบ');
  console.log(`สร้าง admin สำเร็จ  ->  user: ${username}  pass: ${password}`);
  console.log('!! กรุณาเปลี่ยนรหัสผ่านหลัง login ครั้งแรก');
}

// ---------- ข้อมูล base (ใส่ตอน DB ว่าง — สร้างใหม่ทุก deploy บน host ephemeral) ----------
// name, category, qty, tracked, prefix(สำหรับ tracked)
const BASE_ITEMS = [
  ['Base-Frame',                'ชิ้นส่วน/อุปกรณ์', 19, false],
  ['DC-DC Step-Down Buck 300W 20A', 'บอร์ด',      19, true,  'DCDC-'],
  ['ESP-Frame',                 'ชิ้นส่วน/อุปกรณ์', 15, false],
  ['Encoder',                   'บอร์ด',           19, true,  'ENC-'],
  ['Lidar',                     'ชิ้นส่วน/อุปกรณ์', 20, true,  'LIDAR-'],
  ['Lidar-Frame',               'ชิ้นส่วน/อุปกรณ์', 19, false],
  ['MotorDrive',                'ชิ้นส่วน/อุปกรณ์', 38, false],
  ['Raspberry Pi 4',            'บอร์ด',           3,  true,  'RPI4-'],
  ['Raspberry Pi 5',            'บอร์ด',           19, true,  'RPI5-'],
  ['Roof-Frame',                'ชิ้นส่วน/อุปกรณ์', 19, false],
  ['Stepdown-3A',               'บอร์ด',           19, true,  'STEP3A-'],
];

const itemCount = db.prepare('SELECT COUNT(*) c FROM items').get().c;
if (itemCount === 0) {
  const insItem = db.prepare(
    "INSERT INTO items (name, type, category, unit, location, qty, min_qty, tracked) VALUES (?,?,?,?,?,?,?,?)"
  );
  const insUnit = db.prepare(
    "INSERT INTO units (item_id, code, status) VALUES (?,?, 'available')"
  );
  db.tx(() => {
    for (const [name, category, qty, tracked, prefix] of BASE_ITEMS) {
      // หมวดทั้งหมดนี้เป็นกลุ่มยืม-คืน (type=tool)
      const info = insItem.run(name, 'tool', category, 'ชิ้น', '', tracked ? 0 : qty, 0, tracked ? 1 : 0);
      const itemId = Number(info.lastInsertRowid);
      if (tracked) {
        for (let i = 1; i <= qty; i++) {
          insUnit.run(itemId, `${prefix}${String(i).padStart(2, '0')}`);
        }
        db.recalcTracked(itemId);
      }
    }
  });
  console.log(`ใส่ข้อมูล base ${BASE_ITEMS.length} รายการ`);
}

console.log('เสร็จสิ้น');
