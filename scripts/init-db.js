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

// ข้อมูลตัวอย่าง (ใส่ครั้งเดียวตอน DB ว่าง)
const itemCount = db.prepare('SELECT COUNT(*) c FROM items').get().c;
if (itemCount === 0) {
  const ins = db.prepare(
    'INSERT INTO items (name, type, unit, location, qty, min_qty) VALUES (?,?,?,?,?,?)'
  );
  ins.run('ถุงมือไนไตร (M)', 'consumable', 'กล่อง', 'ตู้ A ชั้น 1', 20, 5);
  ins.run('แอลกอฮอล์ 70%', 'consumable', 'ขวด', 'ตู้ A ชั้น 2', 12, 3);
  ins.run('มัลติมิเตอร์', 'tool', 'เครื่อง', 'ตู้เครื่องมือ B', 3, 0);
  ins.run('หัวแร้ง', 'tool', 'ด้าม', 'ตู้เครื่องมือ B', 4, 0);
  console.log('ใส่ข้อมูลตัวอย่าง 4 รายการ');
}

console.log('เสร็จสิ้น');
