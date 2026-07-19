const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' })); // เผื่อรูปหลักฐาน (data URL)
app.use(express.static(path.join(__dirname, 'public')));

// โฟลเดอร์เก็บรูปหลักฐาน (แยกไฟล์จาก DB) — อยู่ข้าง DB บน disk ถาวร
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'inventory.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(path.dirname(DB_PATH), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(
  cookieSession({
    name: 'sess',
    keys: [process.env.SESSION_SECRET || 'change-this-secret-in-production'],
    maxAge: 8 * 60 * 60 * 1000, // 8 ชม.
    sameSite: 'lax',
  })
);

// ---------- helpers ----------
// ผู้เยี่ยมชม (ยังไม่ login) — จัดการคลังได้ แต่เข้าคำขอ/ผู้ใช้ไม่ได้
// ใช้ id ของบัญชี guest จริงใน DB เพื่อให้ประวัติ (FK user_id) บันทึกได้
let guestId = null;
function guestUser() {
  if (guestId == null) {
    guestId = db.prepare("SELECT id FROM users WHERE username='guest'").get()?.id ?? 0;
  }
  return { id: guestId, username: 'guest', fullname: 'ผู้เยี่ยมชม', role: 'guest' };
}

function currentUser(req) {
  if (!req.session || !req.session.uid) return guestUser();
  return db
    .prepare('SELECT id, username, fullname, role FROM users WHERE id = ? AND active = 1')
    .get(req.session.uid) || guestUser();
}
// เข้าถึงได้ทุกคน (รวม guest)
function requireAuth(req, res, next) {
  req.user = currentUser(req);
  next();
}
// ต้อง login จริง (guest ห้าม)
function requireUser(req, res, next) {
  if (req.user.role === 'guest')
    return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
  next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'ต้องเป็น admin เท่านั้น' });
  next();
}
// ⚠️ จัดการคลัง (ของ/หน่วย/ที่เก็บ) — เปิดให้ guest ทำได้เท่า admin ตามที่ตั้งค่าไว้
// (คำขอ/ผู้ใช้ ยังต้อง login) — ถ้าจะปิดให้ guest แก้ไม่ได้ เปลี่ยนเป็น requireAdmin
function requireManage(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'guest') return next();
  return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการคลัง' });
}

// หมวดหมู่ → พฤติกรรม (tool = ยืม-คืน, consumable = เบิกหมด)
const CATEGORY_TYPE = {
  'เครื่องมือ': 'tool',
  'ชิ้นส่วน/อุปกรณ์': 'tool',
  'บอร์ด': 'tool',
  'หุ่นยนต์': 'tool',
  'สาย USB (ไม่ตัด)': 'tool',
  'สายไฟ': 'consumable',
  'วัสดุสิ้นเปลือง': 'consumable',
  'สาย USB (ใช้ตัด)': 'consumable',
};
// แปลง input (category) เป็น { category, type }
function resolveCategory(category, fallbackType) {
  if (category && CATEGORY_TYPE[category]) return { category, type: CATEGORY_TYPE[category] };
  const type = fallbackType === 'tool' ? 'tool' : 'consumable';
  return { category: type === 'tool' ? 'เครื่องมือ' : 'วัสดุสิ้นเปลือง', type };
}

// ---------- auth ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password))
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  req.session.uid = user.id;
  res.json({ id: user.id, username: user.username, fullname: user.fullname, role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
  res.json(u);
});

app.post('/api/change-password', requireAuth, requireUser, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัว' });
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword || '', row.password))
    return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    req.user.id
  );
  res.json({ ok: true });
});

// ---------- users (admin) ----------
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(
    db.prepare('SELECT id, username, fullname, role, created_at FROM users WHERE active = 1 ORDER BY id').all()
  );
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, fullname, role } = req.body || {};
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: 'ต้องมี username และ password อย่างน้อย 6 ตัว' });
  try {
    const info = db
      .prepare('INSERT INTO users (username, password, fullname, role) VALUES (?,?,?,?)')
      .run(
        username,
        bcrypt.hashSync(password, 10),
        fullname || '',
        role === 'admin' ? 'admin' : 'staff'
      );
    res.json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: 'username นี้มีอยู่แล้ว' });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'ลบตัวเองไม่ได้' });
  // soft-delete: ซ่อน + ห้าม login แต่เก็บประวัติ/คำขอที่อ้างถึง (กัน FK constraint พัง)
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- items ----------
// select + สูตรคำนวณกลาง — ใช้ทั้งหน้ารายการของและแดชบอร์ด (ตัวเลขตรงกันเสมอ)
const ITEM_SELECT = `
  SELECT i.*,
    (SELECT COUNT(*) FROM units u WHERE u.item_id = i.id AND u.active = 1) AS total_units,
    (SELECT COUNT(*) FROM units u WHERE u.item_id = i.id AND u.active = 1 AND u.status = 'borrowed') AS units_borrowed,
    (SELECT COUNT(*) FROM units u WHERE u.item_id = i.id AND u.active = 1 AND u.status IN ('repair','lost')) AS units_dead,
    (SELECT COALESCE(SUM(CASE kind WHEN 'borrow' THEN qty WHEN 'return' THEN -qty ELSE 0 END),0)
       FROM transactions t WHERE t.item_id = i.id) AS borrowed_net,
    (SELECT COALESCE(SUM(qty),0) FROM transactions t WHERE t.item_id = i.id AND kind='issue') AS issued_total
  FROM items i`;

// คำนวณ มี / ถูกยืม / คงเหลือ
// ของ track รายตัว: หน่วยที่ "พัง/หาย" ถือว่าตัดออกจากคลังแล้ว ไม่นับใน "มีทั้งหมด"
function decorateItem(i) {
  const remaining = i.qty;
  let out; // ถูกยืมออกไป ณ ตอนนี้ (สำหรับสิ้นเปลือง = ยอดที่เบิกใช้ไปสะสม)
  if (i.tracked) out = i.units_borrowed;                         // เฉพาะที่ถูกยืม (ไม่รวมพัง/หาย)
  else if (i.type === 'tool') out = Math.max(0, i.borrowed_net); // ยืมค้างอยู่
  else out = i.issued_total;                                     // วัสดุสิ้นเปลือง = เบิกไปแล้วรวม
  return { ...i, out_qty: out, total_qty: remaining + out };
}

// ใครยืมของชิ้นนี้อยู่ ณ ตอนนี้ — ตรงกับ out_qty (พัง/หาย ตัดออกจากคลังแล้ว ไม่แสดงที่นี่)
function borrowersOf(item) {
  if (item.tracked) {
    return db
      .prepare("SELECT code, status, holder FROM units WHERE item_id=? AND active=1 AND status='borrowed' ORDER BY code")
      .all(item.id)
      .map((u) => ({ label: u.code, status: u.status, person: u.holder || '' }));
  }
  // ของไม่ track รายตัว: ยืมค้าง = borrow − return ต่อคน
  return db
    .prepare(
      `SELECT person, SUM(CASE kind WHEN 'borrow' THEN qty ELSE -qty END) AS n
       FROM transactions WHERE item_id=? AND kind IN ('borrow','return') AND person != ''
       GROUP BY person HAVING n > 0`
    )
    .all(item.id)
    .map((r) => ({ label: `${r.n} ${item.unit}`, status: 'borrowed', person: r.person }));
}

app.get('/api/items', requireAuth, (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const includeEmpty = req.query.includeEmpty === '1' ? 1 : 0;
  const rows = db
    .prepare(
      `${ITEM_SELECT}
       WHERE i.active = 1 AND (i.name LIKE ? OR i.location LIKE ?)
         -- ซ่อนของใช้แล้วทิ้งที่เบิกหมด (เหลือ 0) ออกจากรายการ (ข้อมูล/ประวัติยังอยู่)
         AND (? = 1 OR i.type != 'consumable' OR i.qty > 0)
       ORDER BY i.name`
    )
    .all(q, q, includeEmpty);
  res.json(rows.map(decorateItem));
});

app.get('/api/items/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  const history = db
    .prepare(
      `SELECT t.*, u.username AS by_user
       FROM transactions t JOIN users u ON u.id = t.user_id
       WHERE t.item_id = ? ORDER BY t.id DESC LIMIT 100`
    )
    .all(req.params.id);
  res.json({ item, history });
});

app.post('/api/items', requireAuth, requireAdmin, (req, res) => {
  const { name, category, type: rawType, unit, location, qty, min_qty, note, tracked, spec } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'ต้องมีชื่อรายการ' });
  const { category: cat, type } = resolveCategory(category, rawType);
  const isTracked = tracked ? 1 : 0;
  // ของ track รายตัวเริ่มที่ 0 หน่วยเสมอ (ไปเพิ่มหน่วยทีหลัง)
  const startQty = isTracked ? 0 : Math.max(0, parseInt(qty, 10) || 0);
  const id = db.tx(() => {
    const info = db
      .prepare(
        `INSERT INTO items (name, type, category, unit, location, qty, min_qty, note, tracked, spec)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        name.trim(),
        type,
        cat,
        (unit || 'ชิ้น').trim(),
        (location || '').trim(),
        startQty,
        Math.max(0, parseInt(min_qty, 10) || 0),
        (note || '').trim(),
        isTracked,
        (spec || '').trim()
      );
    const newId = Number(info.lastInsertRowid);
    if (startQty > 0) {
      db.prepare(
        `INSERT INTO transactions (item_id, user_id, kind, qty, delta, note)
         VALUES (?,?, 'add', ?, ?, 'ยอดตั้งต้น')`
      ).run(newId, req.user.id, startQty, startQty);
    }
    return newId;
  });
  const imgPath = saveImage(req.body?.image, `item-${id}`);
  if (imgPath) db.prepare('UPDATE items SET image=? WHERE id=?').run(imgPath, id);
  res.json({ id });
});

app.put('/api/items/:id', requireAuth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  const { name, category, type: rawType, unit, location, min_qty, note, spec, tracked } = req.body || {};
  const { category: cat, type } = resolveCategory(category, rawType || item.type);
  // เปิด track รายตัวให้ของเดิมได้ (0 -> 1) — qty จะมาจากจำนวนหน่วยที่สร้าง จึงรีเซ็ตเป็น 0
  // ปิด track (1 -> 0) ไม่รองรับ เพราะมีหน่วย/ประวัติผูกอยู่
  if (!item.tracked && tracked && type === 'tool') {
    db.prepare('UPDATE items SET tracked=1, qty=0 WHERE id=?').run(item.id);
  }
  db.prepare(
    `UPDATE items SET name=?, type=?, category=?, unit=?, location=?, min_qty=?, note=?, spec=? WHERE id=?`
  ).run(
    (name || item.name).trim(),
    type,
    cat,
    (unit || item.unit).trim(),
    (location ?? item.location).trim(),
    Math.max(0, parseInt(min_qty, 10) || 0),
    (note ?? item.note).trim(),
    (spec ?? item.spec ?? '').trim(),
    item.id
  );
  // image: '' = สั่งลบรูปเดิม, data URL = รูปใหม่, ไม่ส่งมา = คงเดิม
  if (req.body?.image === '') {
    db.prepare("UPDATE items SET image='' WHERE id=?").run(item.id);
  } else {
    const imgPath = saveImage(req.body?.image, `item-${item.id}`);
    if (imgPath) db.prepare('UPDATE items SET image=? WHERE id=?').run(imgPath, item.id);
  }
  res.json({ ok: true });
});

// ---------- locations (ตู้/ที่เก็บ) ----------
app.get('/api/locations', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM locations WHERE active=1 ORDER BY name').all());
});

app.post('/api/locations', requireAuth, requireAdmin, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'ต้องมีชื่อตู้/ที่เก็บ' });
  try {
    const info = db.prepare('INSERT INTO locations (name) VALUES (?)').run(name);
    res.json({ id: Number(info.lastInsertRowid), name });
  } catch {
    // มีอยู่แล้ว — คืนตัวที่มี
    const row = db.prepare('SELECT * FROM locations WHERE name=?').get(name);
    res.json({ id: row.id, name });
  }
});

app.delete('/api/items/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE items SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- movements: add / issue / borrow / return / adjust ----------
const KINDS = {
  add: 1, // ซื้อเข้า / รับเข้า
  issue: -1, // เบิก (วัสดุสิ้นเปลือง)
  borrow: -1, // ยืม (เครื่องมือ)
  return: 1, // คืน
  adjust: 0, // ปรับยอด (ใช้ delta ตรงๆ)
};

app.post('/api/items/:id/move', requireAuth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (item.tracked)
    return res.status(400).json({ error: 'ของนี้ track รายตัว — ให้จัดการที่หน่วยย่อยแทน' });

  const { kind, qty, person, note, target } = req.body || {};
  if (!(kind in KINDS)) return res.status(400).json({ error: 'ประเภทการเคลื่อนไหวไม่ถูกต้อง' });

  const amount = Math.abs(parseInt(qty, 10) || 0);
  let delta;
  if (kind === 'adjust') {
    // target = ยอดคงเหลือใหม่ที่ต้องการ
    const newQty = Math.max(0, parseInt(target, 10));
    if (Number.isNaN(newQty)) return res.status(400).json({ error: 'ระบุยอดใหม่' });
    delta = newQty - item.qty;
  } else {
    if (amount <= 0) return res.status(400).json({ error: 'จำนวนต้องมากกว่า 0' });
    delta = KINDS[kind] * amount;
  }

  if (item.qty + delta < 0)
    return res.status(400).json({ error: `คงเหลือไม่พอ (มี ${item.qty} ${item.unit})` });

  const id = db.tx(() => {
    db.prepare('UPDATE items SET qty = qty + ? WHERE id = ?').run(delta, item.id);
    const info = db
      .prepare(
        `INSERT INTO transactions (item_id, user_id, kind, qty, delta, person, note)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        item.id,
        req.user.id,
        kind,
        Math.abs(delta),
        delta,
        (person || '').trim(),
        (note || '').trim()
      );
    return Number(info.lastInsertRowid);
  });
  res.json({ id, newQty: item.qty + delta });
});

// ---------- units (หน่วยย่อยรายตัว) ----------
function logUnitTx(itemId, unitId, kind, delta, person, note, userId) {
  db.prepare(
    `INSERT INTO transactions (item_id, unit_id, user_id, kind, qty, delta, person, note)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(itemId, unitId, userId, kind, 1, delta, person || '', note || '');
}

// รายชื่อหน่วยของ item
app.get('/api/items/:id/units', requireAuth, (req, res) => {
  const units = db
    .prepare('SELECT * FROM units WHERE item_id = ? AND active = 1 ORDER BY code')
    .all(req.params.id);
  res.json(units);
});

// เพิ่มหน่วย — เดี่ยว หรือ bulk generate (prefix + start + count + pad)
app.post('/api/items/:id/units', requireAuth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (!item.tracked) return res.status(400).json({ error: 'ของนี้ไม่ได้ track รายตัว' });

  const { mode, code, prefix, start, count, pad, note } = req.body || {};

  // สร้างรายการรหัสที่จะเพิ่ม
  let codes = [];
  if (mode === 'bulk') {
    const s = parseInt(start, 10);
    const n = parseInt(count, 10);
    const p = Math.max(0, parseInt(pad, 10) || 0);
    if (Number.isNaN(s) || Number.isNaN(n) || n < 1 || n > 500)
      return res.status(400).json({ error: 'ระบุเลขเริ่มต้นและจำนวน (1–500)' });
    for (let i = 0; i < n; i++) {
      const num = String(s + i).padStart(p, '0');
      codes.push(`${(prefix || '').trim()}${num}`);
    }
  } else {
    if (!code || !code.trim()) return res.status(400).json({ error: 'ต้องมีรหัส' });
    codes = [code.trim()];
  }

  // กันรหัสซ้ำภายใน item เดียวกัน
  const existing = new Set(
    db.prepare('SELECT code FROM units WHERE item_id = ? AND active = 1').all(item.id).map((u) => u.code)
  );
  const dup = codes.filter((c) => existing.has(c));
  if (dup.length) return res.status(400).json({ error: `รหัสซ้ำ: ${dup.slice(0, 5).join(', ')}${dup.length > 5 ? '…' : ''}` });
  if (new Set(codes).size !== codes.length)
    return res.status(400).json({ error: 'มีรหัสซ้ำกันในชุดที่จะสร้าง' });

  const created = db.tx(() => {
    const insUnit = db.prepare(
      "INSERT INTO units (item_id, code, status, note) VALUES (?,?, 'available', ?)"
    );
    codes.forEach((c) => insUnit.run(item.id, c, (note || '').trim()));
    const avail = db.recalcTracked(item.id);
    logUnitTx(item.id, null, 'add', codes.length, '', `สร้าง ${codes.length} หน่วย: ${codes.join(', ')}`, req.user.id);
    return avail;
  });
  res.json({ ok: true, added: codes.length, available: created });
});

// เปลี่ยนสถานะหน่วย: borrow / return / repair / ready / lost
const UNIT_ACTIONS = {
  borrow: { from: ['available'], to: 'borrowed', needPerson: true },
  return: { from: ['borrowed'], to: 'available' },
  repair: { from: ['available', 'borrowed'], to: 'repair' },
  ready: { from: ['repair', 'lost'], to: 'available' },
  lost: { from: ['available', 'borrowed', 'repair'], to: 'lost' },
};

app.post('/api/units/:id/move', requireAuth, requireAdmin, (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ? AND active = 1').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'ไม่พบหน่วยนี้' });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(unit.item_id);

  const { action, person, note } = req.body || {};
  const spec = UNIT_ACTIONS[action];
  if (!spec) return res.status(400).json({ error: 'การกระทำไม่ถูกต้อง' });
  if (!spec.from.includes(unit.status))
    return res.status(400).json({ error: `หน่วยนี้สถานะ "${unit.status}" ทำรายการนี้ไม่ได้` });

  const availBefore = item.qty;
  const holder = spec.to === 'borrowed' ? (person || '').trim() : '';

  const result = db.tx(() => {
    db.prepare('UPDATE units SET status = ?, holder = ? WHERE id = ?').run(spec.to, holder, unit.id);
    const availAfter = db.recalcTracked(item.id);
    logUnitTx(item.id, unit.id, action, availAfter - availBefore, person, `${unit.code}${note ? ' — ' + note : ''}`, req.user.id);
    return availAfter;
  });
  res.json({ ok: true, available: result });
});

// เลิกใช้หน่วย (admin)
app.delete('/api/units/:id', requireAuth, requireAdmin, (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'ไม่พบหน่วยนี้' });
  db.tx(() => {
    db.prepare('UPDATE units SET active = 0 WHERE id = ?').run(unit.id);
    db.recalcTracked(unit.item_id);
  });
  res.json({ ok: true });
});

// ---------- requests (workflow ขอยืม → อนุมัติ → ส่งมอบ → รับ) ----------
const REQ_SELECT = `
  SELECT r.*,
    i.name AS item_name, i.unit AS item_unit, i.type AS item_type, i.tracked,
    u.code AS unit_code,
    (SELECT GROUP_CONCAT(u2.code, ', ') FROM request_units ru JOIN units u2 ON u2.id = ru.unit_id WHERE ru.request_id = r.id) AS unit_codes,
    req.username AS requester_name, req.fullname AS requester_fullname,
    apr.username AS approver_name
  FROM requests r
  JOIN items i ON i.id = r.item_id
  LEFT JOIN units u ON u.id = r.unit_id
  JOIN users req ON req.id = r.requester_id
  LEFT JOIN users apr ON apr.id = r.approver_id
`;

// เก็บรูปเป็น data URL ใน DB (ไป Turso ด้วย) — ไม่เก็บเป็นไฟล์บน disk เพราะ host แบบ ephemeral
// ล้าง disk ทุก redeploy แล้วรูปจะหายทั้งที่ DB ยังจำ path ไว้ (ภาพแตก)
// รูปเก่าที่เป็น path /uploads/... ยังเสิร์ฟได้ถ้าไฟล์ยังอยู่ (backward compatible)
function saveImage(dataUrl /* , baseName */) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 0.75); // ขนาดจริงหลังถอด base64
  if (bytes > 4 * 1024 * 1024) return null;     // กันรูปใหญ่เกิน (client ย่อ ~1280px มาแล้ว)
  return dataUrl;
}

// Staff/Admin สร้างคำขอ (เลือกแค่ "ชนิดของ")
app.post('/api/requests', requireAuth, (req, res) => {
  const { item_id, qty, note } = req.body || {};
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(item_id);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการของ' });
  const kind = item.type === 'consumable' ? 'issue' : 'borrow';
  const n = Math.max(1, parseInt(qty, 10) || 1);
  const info = db
    .prepare(
      `INSERT INTO requests (item_id, requester_id, kind, qty, note, status)
       VALUES (?,?,?,?,?, 'pending')`
    )
    .run(item.id, req.user.id, kind, n, (note || '').trim());
  res.json({ id: Number(info.lastInsertRowid) });
});

// สร้างออเดอร์ = หลายรายการใน 1 ใบ (ตะกร้า) — แต่ละบรรทัดเป็น request แยก (reuse workflow เดิม)
app.post('/api/orders', requireAuth, (req, res) => {
  const { note, items, person } = req.body || {};
  const who = (person || '').trim() || req.user.fullname || req.user.username;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'ตะกร้าว่าง' });
  // ตรวจของก่อนทั้งหมด
  const lines = [];
  for (const it of items) {
    const item = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(it.item_id);
    if (!item) return res.status(404).json({ error: `ไม่พบรายการของ (id ${it.item_id})` });
    const n = Math.max(1, parseInt(it.qty, 10) || 1);
    lines.push({ item, qty: n, note: (it.note || '').trim(), kind: item.type === 'consumable' ? 'issue' : 'borrow' });
  }
  const orderId = db.tx(() => {
    const oi = db.prepare('INSERT INTO orders (requester_id, note, person) VALUES (?,?,?)')
      .run(req.user.id, (note || '').trim(), who);
    const oid = Number(oi.lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO requests (item_id, requester_id, kind, qty, note, status, order_id, person)
       VALUES (?,?,?,?,?, 'pending', ?, ?)`
    );
    lines.forEach((l) => ins.run(l.item.id, req.user.id, l.kind, l.qty, l.note, oid, who));
    return oid;
  });
  res.json({ id: orderId, lines: lines.length });
});

// รายการคำขอ — staff เห็นของตัวเอง, admin เห็นทั้งหมด
app.get('/api/requests', requireAuth, (req, res) => {
  const { status, scope } = req.query;
  const where = [];
  const args = [];
  if (req.user.role !== 'admin' || scope === 'mine') {
    where.push('r.requester_id = ?');
    args.push(req.user.id);
  }
  if (status) {
    where.push('r.status = ?');
    args.push(status);
  }
  const sql = REQ_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY r.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...args));
});

// จำนวนที่รอ admin ดำเนินการ (สำหรับ badge)
app.get('/api/requests/counts', requireAuth, (req, res) => {
  // จำนวน "ออเดอร์" ที่ยังถูกยืมอยู่ (นับเป็นใบ ไม่ใช่รายบรรทัด)
  const borrowedOrders = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT COALESCE(order_id, -id) AS k FROM requests WHERE status='received' GROUP BY k
       )`
    )
    .get().n;
  if (req.user.role === 'admin') {
    const pending = db.prepare("SELECT COUNT(*) n FROM requests WHERE status='pending'").get().n;
    const toHand = db.prepare("SELECT COUNT(*) n FROM requests WHERE status='approved'").get().n;
    const handed = db.prepare("SELECT COUNT(*) n FROM requests WHERE status='handed'").get().n;
    res.json({ pending, toHand, handed, borrowedOrders });
  } else {
    const toConfirm = db
      .prepare("SELECT COUNT(*) n FROM requests WHERE status='handed' AND requester_id=?")
      .get(req.user.id).n;
    res.json({ toConfirm, borrowedOrders });
  }
});

function getReq(id) {
  return db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
}
// ชื่อผู้ขอ — ใช้ชื่อที่พิมพ์เอง (guest) ถ้ามี ไม่งั้นใช้ชื่อบัญชี
function reqPerson(r) {
  if (r.person && r.person.trim()) return r.person.trim();
  const u = db.prepare('SELECT fullname, username FROM users WHERE id=?').get(r.requester_id);
  return u ? (u.fullname || u.username) : '';
}

// หน่วยที่จองไว้ให้คำขอ (fallback unit_id เดี่ยวสำหรับข้อมูลเก่า)
function reqUnitIds(r) {
  const ids = db.prepare('SELECT unit_id FROM request_units WHERE request_id = ?').all(r.id).map((x) => x.unit_id);
  if (ids.length) return ids;
  return r.unit_id ? [r.unit_id] : [];
}

// Admin: อนุมัติ = ตัดของออกจากคลังให้เลย (จบในขั้นตอนเดียว ไม่มีส่งมอบ/ยืนยันรับ)
// track รายตัว: ต้องเลือกหน่วยจริงให้ครบตามจำนวนที่ขอ
app.post('/api/requests/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || r.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้อนุมัติไม่ได้' });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(r.item_id);
  const who = reqPerson(r);

  // เตรียม/ตรวจหน่วยที่เลือก (เฉพาะของ track รายตัว)
  let ids = [];
  if (item.tracked) {
    let raw = req.body?.unit_ids;
    if (!Array.isArray(raw)) raw = req.body?.unit_id != null ? [req.body.unit_id] : [];
    ids = [...new Set(raw.map((x) => parseInt(x, 10)).filter((x) => x))];
    if (ids.length !== r.qty)
      return res.status(400).json({ error: `ต้องเลือกหน่วยว่างให้ครบ ${r.qty} ชิ้น` });
    for (const id of ids) {
      const unit = db.prepare("SELECT * FROM units WHERE id = ? AND item_id = ? AND active=1 AND status='available'").get(id, item.id);
      if (!unit) return res.status(400).json({ error: 'มีหน่วยที่เลือกไม่ว่างแล้ว' });
    }
  } else if (item.qty < r.qty) {
    return res.status(400).json({ error: `คงเหลือไม่พอ (มี ${item.qty})` });
  }

  try {
    db.tx(() => {
      if (item.tracked) {
        db.prepare('DELETE FROM request_units WHERE request_id = ?').run(r.id);
        const insRU = db.prepare('INSERT INTO request_units (request_id, unit_id) VALUES (?,?)');
        for (const id of ids) {
          insRU.run(r.id, id);
          const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
          db.prepare("UPDATE units SET status='borrowed', holder=? WHERE id=?").run(who, id);
          db.prepare(
            `INSERT INTO transactions (item_id, unit_id, user_id, kind, qty, delta, person, note)
             VALUES (?,?,?, 'borrow', 1, -1, ?, ?)`
          ).run(item.id, id, req.user.id, who, `อนุมัติคำขอ #${r.id}: ${unit.code}`);
        }
        db.recalcTracked(item.id);
      } else {
        const delta = -r.qty;
        db.prepare('UPDATE items SET qty = qty + ? WHERE id = ?').run(delta, item.id);
        db.prepare(
          `INSERT INTO transactions (item_id, user_id, kind, qty, delta, person, note)
           VALUES (?,?,?,?,?,?,?)`
        ).run(item.id, req.user.id, r.kind, r.qty, delta, who, `อนุมัติคำขอ #${r.id}`);
      }
      // อนุมัติแล้วถือว่าอยู่กับผู้ขอเลย (ของเบิกหมด = ปิดจบ)
      const finalStatus = item.type === 'consumable' ? 'returned' : 'received';
      db.prepare(
        `UPDATE requests SET status=?, approver_id=?, unit_id=?,
           approved_at=datetime('now','localtime'), received_at=datetime('now','localtime'),
           closed_at=CASE WHEN ?='returned' THEN datetime('now','localtime') ELSE NULL END
         WHERE id=?`
      ).run(finalStatus, req.user.id, ids[0] ?? null, finalStatus, r.id);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: ปฏิเสธ
app.post('/api/requests/:id/reject', requireAuth, requireAdmin, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || !['pending', 'approved'].includes(r.status))
    return res.status(400).json({ error: 'คำขอนี้ปฏิเสธไม่ได้' });
  db.prepare(
    "UPDATE requests SET status='rejected', approver_id=?, reject_reason=?, closed_at=datetime('now','localtime') WHERE id=?"
  ).run(req.user.id, (req.body?.reason || '').trim(), r.id);
  res.json({ ok: true });
});

// Admin: ส่งมอบ (ตัดของออกจากคลัง + แนบรูปได้)
app.post('/api/requests/:id/handover', requireAuth, requireAdmin, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || r.status !== 'approved') return res.status(400).json({ error: 'คำขอนี้ส่งมอบไม่ได้' });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(r.item_id);
  const img = saveImage(req.body?.image, `req-${r.id}-handover`);
  const requester = db.prepare('SELECT * FROM users WHERE id = ?').get(r.requester_id);
  const who = requester.fullname || requester.username;

  try {
    db.tx(() => {
      if (item.tracked) {
        const ids = reqUnitIds(r);
        if (ids.length !== r.qty) throw new Error('จำนวนหน่วยที่จองไว้ไม่ครบตามคำขอ');
        for (const uid of ids) {
          const unit = db.prepare("SELECT * FROM units WHERE id=? AND status='available'").get(uid);
          if (!unit) throw new Error('มีหน่วยที่เลือกไม่ว่างแล้ว');
          db.prepare("UPDATE units SET status='borrowed', holder=? WHERE id=?").run(who, unit.id);
          db.prepare(
            `INSERT INTO transactions (item_id, unit_id, user_id, kind, qty, delta, person, note)
             VALUES (?,?,?, 'borrow', 1, -1, ?, ?)`
          ).run(item.id, unit.id, req.user.id, who, `ส่งมอบตามคำขอ #${r.id}: ${unit.code}`);
        }
        db.recalcTracked(item.id);
      } else {
        if (item.qty < r.qty) throw new Error(`คงเหลือไม่พอ (มี ${item.qty})`);
        const delta = -r.qty;
        db.prepare('UPDATE items SET qty = qty + ? WHERE id = ?').run(delta, item.id);
        db.prepare(
          `INSERT INTO transactions (item_id, user_id, kind, qty, delta, person, note)
           VALUES (?,?,?,?,?,?,?)`
        ).run(item.id, req.user.id, r.kind, r.qty, delta, who, `ส่งมอบตามคำขอ #${r.id}`);
      }
      db.prepare(
        "UPDATE requests SET status='handed', image_handover=?, handed_at=datetime('now','localtime') WHERE id=?"
      ).run(img, r.id);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Staff: ยืนยันรับ (เจ้าของคำขอเท่านั้น + แนบรูปได้)
app.post('/api/requests/:id/receive', requireAuth, requireUser, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || r.status !== 'handed') return res.status(400).json({ error: 'คำขอนี้ยืนยันรับไม่ได้' });
  if (r.requester_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'ยืนยันได้เฉพาะผู้ขอ' });
  const img = saveImage(req.body?.image, `req-${r.id}-receive`);
  db.prepare(
    "UPDATE requests SET status='received', image_receive=?, received_at=datetime('now','localtime') WHERE id=?"
  ).run(img, r.id);
  res.json({ ok: true });
});

// ยกเลิกคำขอ (ผู้ขอ ตอนยัง pending)
app.post('/api/requests/:id/cancel', requireAuth, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || r.status !== 'pending') return res.status(400).json({ error: 'ยกเลิกไม่ได้' });
  if (r.requester_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'ยกเลิกได้เฉพาะผู้ขอ' });
  db.prepare("UPDATE requests SET status='cancelled', closed_at=datetime('now','localtime') WHERE id=?").run(r.id);
  res.json({ ok: true });
});

// คืนของ (ปิดคำขอที่ received) — admin หรือผู้ขอ
app.post('/api/requests/:id/return', requireAuth, requireAdmin, (req, res) => {
  const r = getReq(req.params.id);
  if (!r || r.status !== 'received') return res.status(400).json({ error: 'คืนไม่ได้' });
  if (req.user.role !== 'admin' && r.requester_id !== req.user.id)
    return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(r.item_id);
  const who = reqPerson(r);
  db.tx(() => {
    const ids = item.tracked ? reqUnitIds(r) : [];
    if (item.tracked && ids.length) {
      for (const uid of ids) {
        db.prepare("UPDATE units SET status='available', holder='' WHERE id=?").run(uid);
        db.prepare(
          `INSERT INTO transactions (item_id, unit_id, user_id, kind, qty, delta, person, note)
           VALUES (?,?,?, 'return', 1, 1, ?, ?)`
        ).run(item.id, uid, req.user.id, who, `คืนตามคำขอ #${r.id}`);
      }
      db.recalcTracked(item.id);
    } else if (item.type === 'tool') {
      db.prepare('UPDATE items SET qty = qty + ? WHERE id = ?').run(r.qty, item.id);
      db.prepare(
        `INSERT INTO transactions (item_id, user_id, kind, qty, delta, person, note)
         VALUES (?,?, 'return', ?, ?, ?, ?)`
      ).run(item.id, req.user.id, r.qty, r.qty, who, `คืนตามคำขอ #${r.id}`);
    }
    db.prepare("UPDATE requests SET status='returned', closed_at=datetime('now','localtime') WHERE id=?").run(r.id);
  });
  res.json({ ok: true });
});

// หน่วยที่พัง/หาย ทั้งหมด (หน้าเมนู "ของพัง/หาย")
app.get('/api/broken', requireAuth, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT u.id, u.code, u.status, u.holder, u.item_id, i.name AS item_name, i.unit, i.category
         FROM units u JOIN items i ON i.id = u.item_id
         WHERE u.active = 1 AND u.status IN ('repair','lost')
         ORDER BY i.name, u.status, u.code`
      )
      .all()
  );
});

// ---------- dashboard / reports ----------
app.get('/api/dashboard', requireAuth, (req, res) => {
  const lowStock = db
    .prepare(
      `SELECT * FROM items WHERE active=1 AND type='consumable' AND qty <= min_qty AND min_qty > 0 ORDER BY name`
    )
    .all();
  // เครื่องมือ — ใช้สูตรเดียวกับหน้ารายการของ + แนบรายชื่อผู้ยืมรายตัว
  const borrowedOut = db
    .prepare(`${ITEM_SELECT} WHERE i.active=1 AND i.type='tool' ORDER BY i.name`)
    .all()
    .map(decorateItem)
    .map((i) => ({ ...i, borrowers: borrowersOf(i) }));
  // หน่วยที่ตัดออกจากคลังแล้ว (พัง/หาย) — ของที่ถูกยืมไม่นับ เพราะยังอยู่ในระบบ
  const unitsOut = db
    .prepare(
      `SELECT u.code, u.status, u.holder, i.name AS item_name
       FROM units u JOIN items i ON i.id = u.item_id
       WHERE u.active = 1 AND u.status IN ('repair','lost')
       ORDER BY i.name, u.code`
    )
    .all();
  // ความเคลื่อนไหวล่าสุด — เฉพาะ 2 วันล่าสุด (วันนี้ + เมื่อวาน) ของเก่ากว่านั้นดูได้ที่หน้าประวัติ
  const recent = db
    .prepare(
      `SELECT t.*, i.name AS item_name, i.unit, u.username AS by_user
       FROM transactions t
       JOIN items i ON i.id = t.item_id
       JOIN users u ON u.id = t.user_id
       WHERE date(t.created_at) >= date('now','localtime','-1 day')
       ORDER BY t.id DESC LIMIT 100`
    )
    .all();
  // ยอดรวม — คิดจากรายการทั้งหมดด้วยสูตรเดียวกับหน้ารายการของ (ตัวเลข sync กัน)
  const all = db.prepare(`${ITEM_SELECT} WHERE i.active=1`).all().map(decorateItem);
  const totals = {
    items: all.length,
    total: all.reduce((s, i) => s + i.total_qty, 0),   // จำนวนรวม
    out: all.reduce((s, i) => s + i.out_qty, 0),       // ถูกยืม/ถูกใช้
    remain: all.reduce((s, i) => s + i.qty, 0),        // คงเหลือในคลัง
  };
  res.json({ lowStock, borrowedOut, unitsOut, recent, totals });
});

// ---------- log รวม ----------
app.get('/api/transactions', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, i.name AS item_name, i.unit, u.username AS by_user
       FROM transactions t
       JOIN items i ON i.id = t.item_id
       JOIN users u ON u.id = t.user_id
       ORDER BY t.id DESC LIMIT 300`
    )
    .all();
  res.json(rows);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Lab Inventory ทำงานที่ http://localhost:${PORT}`);
});
