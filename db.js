const path = require('path');
const fs = require('fs');
const Database = require('libsql'); // API แบบ better-sqlite3 (sync) + รองรับ Turso embedded replica

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'inventory.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ถ้าตั้ง TURSO_URL + TURSO_TOKEN = ใช้ Turso (ข้อมูลถาวรบน cloud ข้าม redeploy)
//   - boot: ดึงข้อมูลจาก Turso primary มาไฟล์ local
//   - write: ส่งไป primary อัตโนมัติ (write-through) + apply local
// ถ้าไม่ตั้ง = SQLite ไฟล์ local ธรรมดา (dev)
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

let db;
if (TURSO_URL) {
  db = new Database(DB_PATH, { syncUrl: TURSO_URL, authToken: TURSO_TOKEN });
  try {
    db.sync();
    console.log('เชื่อม Turso + sync สำเร็จ');
  } catch (e) {
    console.error('Turso sync ครั้งแรกล้มเหลว:', e.message);
  }

  // ---------- auto-sync: ดันการเขียนขึ้น Turso primary (durable ข้าม redeploy) ----------
  // debounce 800ms หลังเขียนล่าสุด = รวมหลาย write เป็น sync เดียว (ประหยัด quota)
  let syncTimer = null;
  const scheduleSync = () => {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      try { db.sync(); } catch (e) { console.error('Turso auto-sync ล้มเหลว:', e.message); }
    }, 800);
  };
  const origPrepare = db.prepare.bind(db);
  const origExec = db.exec.bind(db);
  db.prepare = (sql) => {
    const st = origPrepare(sql);
    if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) {
      const origRun = st.run.bind(st);
      st.run = (...a) => { const r = origRun(...a); scheduleSync(); return r; };
    }
    return st;
  };
  db.exec = (sql) => { const r = origExec(sql); scheduleSync(); return r; };

  // flush ขึ้น Turso ก่อนปิด (Render ส่ง SIGTERM ตอน redeploy) — กัน write ล่าสุดหาย
  const flush = () => { try { db.sync(); } catch {} process.exit(0); };
  process.on('SIGTERM', flush);
  process.on('SIGINT', flush);
} else {
  db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;'); // WAL เฉพาะ local (embedded replica จัดการเอง)
}
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,            -- bcrypt hash
    fullname   TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL DEFAULT 'staff',  -- 'admin' | 'staff'
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'consumable', -- 'consumable' (เบิกแล้วหมด) | 'tool' (ยืม-คืน)
    unit       TEXT NOT NULL DEFAULT 'ชิ้น',
    location   TEXT NOT NULL DEFAULT '',
    qty        INTEGER NOT NULL DEFAULT 0,          -- คงเหลือในคลัง
    min_qty    INTEGER NOT NULL DEFAULT 0,          -- จุดเตือนของใกล้หมด
    note       TEXT NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- ทุกการเคลื่อนไหวของสต็อก
  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER NOT NULL REFERENCES items(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    kind        TEXT NOT NULL,        -- 'add' | 'issue' | 'borrow' | 'return' | 'adjust'
    qty         INTEGER NOT NULL,     -- จำนวนที่เคลื่อน (บวกเสมอ)
    delta       INTEGER NOT NULL,     -- ผลต่อ qty คงเหลือ (+/-)
    person      TEXT NOT NULL DEFAULT '', -- ใครเบิก/ยืม
    note        TEXT NOT NULL DEFAULT '',
    ref_id      INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_item ON transactions(item_id);
  CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

  -- หน่วยย่อยรายตัว (สำหรับของที่ track รายตัว เช่น Raspberry Pi RPI-01..RPI-20)
  CREATE TABLE IF NOT EXISTS units (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES items(id),
    code       TEXT NOT NULL,        -- รหัสประจำตัว เช่น RPI-01
    status     TEXT NOT NULL DEFAULT 'available', -- available | borrowed | repair | lost
    holder     TEXT NOT NULL DEFAULT '', -- ใครถือครองอยู่ (เมื่อ borrowed)
    note       TEXT NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_unit_item ON units(item_id);

  -- คำขอยืม/เบิก (workflow ขออนุมัติ)
  CREATE TABLE IF NOT EXISTS requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER NOT NULL REFERENCES items(id),
    unit_id       INTEGER REFERENCES units(id),   -- Admin เลือกตอนอนุมัติ (ของ track รายตัว)
    requester_id  INTEGER NOT NULL REFERENCES users(id),
    approver_id   INTEGER REFERENCES users(id),
    kind          TEXT NOT NULL,        -- 'borrow' (ยืม) | 'issue' (เบิกวัสดุ)
    qty           INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'pending',
                  -- pending | approved | handed | received | rejected | cancelled | returned
    note          TEXT NOT NULL DEFAULT '',   -- เหตุผล/รายละเอียดจากผู้ขอ
    reject_reason TEXT NOT NULL DEFAULT '',
    image_handover TEXT,   -- ภาพหลักฐานตอน Admin ส่งมอบ (data URL)
    image_receive  TEXT,   -- ภาพหลักฐานตอน Staff ยืนยันรับ (data URL)
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    approved_at   TEXT,
    handed_at     TEXT,
    received_at   TEXT,
    closed_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);
  CREATE INDEX IF NOT EXISTS idx_req_requester ON requests(requester_id);

  -- หน่วยที่จองให้คำขอ (tracked ยืมได้หลายหน่วยต่อคำขอ)
  CREATE TABLE IF NOT EXISTS request_units (
    request_id INTEGER NOT NULL REFERENCES requests(id),
    unit_id    INTEGER NOT NULL REFERENCES units(id)
  );
  CREATE INDEX IF NOT EXISTS idx_ru_req ON request_units(request_id);

  -- ตู้/ที่เก็บของ (จัดการเป็นรายการ เลือกจาก dropdown)
  CREATE TABLE IF NOT EXISTS locations (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1
  );
`);

// ---------- migration: เพิ่มคอลัมน์ใหม่ให้ DB เดิมที่มีอยู่แล้ว ----------
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
addColumn('items', 'tracked', 'INTEGER NOT NULL DEFAULT 0'); // 1 = track รายตัว
addColumn('transactions', 'unit_id', 'INTEGER');            // อ้างถึงหน่วยย่อย
addColumn('items', 'category', "TEXT NOT NULL DEFAULT ''");  // หมวดหมู่ย่อย
addColumn('items', 'image', "TEXT NOT NULL DEFAULT ''");     // รูปสินค้า (path /uploads/xxx)

// ตั้งค่า category เริ่มต้นจาก type เดิม (ครั้งแรกที่ยังว่าง)
db.prepare("UPDATE items SET category='เครื่องมือ' WHERE category='' AND type='tool'").run();
db.prepare("UPDATE items SET category='วัสดุสิ้นเปลือง' WHERE category='' AND type='consumable'").run();

// เก็บ location เดิมที่มีอยู่เข้า locations (ครั้งแรก)
{
  const rows = db.prepare("SELECT DISTINCT location FROM items WHERE location != ''").all();
  const ins = db.prepare('INSERT OR IGNORE INTO locations (name) VALUES (?)');
  rows.forEach((r) => ins.run(r.location));
}

// helper ทำงานแบบ transaction (node:sqlite ไม่มี db.transaction ให้)
db.tx = (fn) => {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

// สำหรับของที่ track รายตัว: qty (คงเหลือ) = จำนวนหน่วยที่ว่าง
db.recalcTracked = (itemId) => {
  const avail = db
    .prepare("SELECT COUNT(*) n FROM units WHERE item_id = ? AND active = 1 AND status = 'available'")
    .get(itemId).n;
  db.prepare('UPDATE items SET qty = ? WHERE id = ?').run(avail, itemId);
  return avail;
};

module.exports = db;
