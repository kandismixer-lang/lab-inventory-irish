import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { catLabel } from './Items.jsx';

// แชทบอทค้นในเครื่อง — ไม่ใช้ AI/ไม่มีค่าใช้จ่าย ตอบจากข้อมูลคลังตรงๆ
const GREET = 'สวัสดี 👋 ถามได้เลย เช่น "Raspberry เหลือเท่าไหร่", "อะไรใกล้หมด", "ถูกยืมอะไรบ้าง", "Adapter เก็บที่ไหน", "ฉันยืมอะไรอยู่"';

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

function answer(q, items, broken, me) {
  const t = norm(q);
  if (!t) return null;

  // ทักทาย
  if (/^(สวัสดี|หวัดดี|hello|hi|ดี|ช่วย|help|เมนู)/.test(t))
    return { text: GREET };

  // ของฉันยืมอะไรอยู่ — เทียบชื่อผู้ถือหน่วย (holder) กับชื่อผู้ใช้
  if (/(ฉันยืม|ผมยืม|ของฉัน|ของผม|ยืมอะไรอยู่|ยืมอยู่ไหม|ยืมไรอยู่)/.test(t)) {
    const myName = norm(me?.fullname || me?.username);
    if (!myName || myName === 'guest' || myName === norm('ผู้เยี่ยมชม'))
      return { text: 'ยังไม่ได้ตั้งชื่อ — ตั้งชื่อที่แถบซ้ายก่อน ระบบถึงจะรู้ว่าของไหนของคุณ' };
    const mine = [];
    items.forEach((i) => (i.borrowers || []).forEach((b) => {
      if (norm(b.person) === myName) mine.push({ name: `${i.name}${b.label ? ' · ' + b.label : ''}`, right: 'คุณยืมอยู่', cls: 'warn' });
    }));
    if (mine.length === 0) return { text: `ไม่พบของที่ "${me.fullname || me.username}" ยืมอยู่` };
    return { text: '🙋 ของที่คุณยืมอยู่:', rows: mine };
  }

  // ที่เก็บ — Xเก็บที่ไหน / อยู่ตู้ไหน
  if (/(เก็บที่ไหน|อยู่ที่ไหน|อยู่ตู้|ที่เก็บ|อยู่ไหน|location|วางไว้ไหน)/.test(t)) {
    const words = q.toLowerCase().split(/[\s,?？]+/).filter((w) => w.length >= 2 && !/(เก็บ|ที่ไหน|อยู่|ตู้|ไหน|location|วางไว้)/.test(w));
    const hit = items.filter((i) => words.some((w) => i.name.toLowerCase().includes(w)));
    if (hit.length === 0) return { text: 'บอกชื่อของด้วย เช่น "Adapter เก็บที่ไหน"' };
    return { text: '📍 ที่เก็บ:', rows: hit.slice(0, 12).map((i) => ({ name: i.name, right: i.location || 'ไม่ระบุที่เก็บ', cls: i.location ? 'ok' : 'bad' })) };
  }

  // ใกล้หมด / เหลือน้อย
  if (/(ใกล้หมด|เหลือน้อย|จะหมด|lowstock|เตือน)/.test(t)) {
    const low = items.filter((i) => i.type === 'consumable' && i.min_qty > 0 && i.qty <= i.min_qty);
    if (low.length === 0) return { text: '✅ ไม่มีของใกล้หมด ทุกอย่างยังพอ' };
    return { text: '⚠️ ของใกล้หมด:', rows: low.map((i) => ({ name: i.name, right: `เหลือ ${i.qty} ${i.unit} (เตือนที่ ${i.min_qty})`, cls: 'bad' })) };
  }

  // ถูกยืม / ใช้ไป
  if (/(ถูกยืม|ยืมอยู่|ใครยืม|ยืมไป|กำลังยืม)/.test(t)) {
    const out = items.filter((i) => i.out_qty > 0);
    if (out.length === 0) return { text: '✅ ตอนนี้ไม่มีของถูกยืมอยู่' };
    return { text: '📤 กำลังถูกยืม/ใช้:', rows: out.map((i) => ({ name: i.name, right: `${i.out_qty} ${i.unit}`, cls: 'warn' })) };
  }

  // พัง / หาย
  if (/(พัง|หาย|เสีย|ซ่อม|broken)/.test(t)) {
    if (!broken || broken.length === 0) return { text: '✅ ไม่มีของพัง/หาย' };
    return { text: '🛠️ ของพัง/หาย:', rows: broken.map((u) => ({ name: `${u.item_name} · ${u.code}`, right: u.status === 'lost' ? 'หาย' : 'พัง', cls: 'bad' })) };
  }

  // รวมทั้งคลัง
  if (/(ทั้งหมด|รวม|มีอะไรบ้าง|กี่อย่าง|สรุป)/.test(t)) {
    const total = items.reduce((s, i) => s + i.total_qty, 0);
    const remain = items.reduce((s, i) => s + i.qty, 0);
    const out = items.reduce((s, i) => s + i.out_qty, 0);
    return { text: `📦 มีทั้งหมด ${items.length} ชนิด · ${total} ชิ้น · คงเหลือ ${remain} · ถูกยืม/ใช้ ${out}` };
  }

  // ค้นชื่อของ — เอาคำถามไปเทียบชื่อ/หมวด
  const words = q.toLowerCase().split(/[\s,?？]+/).filter((w) => w.length >= 2 && !/(เหลือ|เท่าไหร่|เท่าไร|กี่|มี|ของ|คลัง|อยู่|ไหม|ครับ|ค่ะ|คะ|จ๊ะ|ชิ้น|อัน|ตัว|ยัง)/.test(w));
  const hit = items.filter((i) => {
    const hay = (i.name + ' ' + catLabel(i)).toLowerCase();
    return words.some((w) => hay.includes(w)) || norm(i.name).includes(t);
  });
  if (hit.length === 0)
    return { text: `หาไม่เจอ "${q}" 🤔 ลองพิมพ์ชื่อของ หรือถาม "อะไรใกล้หมด" / "ถูกยืมอะไรบ้าง"` };
  return {
    text: hit.length === 1 ? 'เจอแล้ว:' : `เจอ ${hit.length} รายการ:`,
    rows: hit.slice(0, 12).map((i) => ({
      name: i.name,
      right: `คงเหลือ ${i.qty}/${i.total_qty} ${i.unit}` + (i.out_qty > 0 ? ` · ยืม ${i.out_qty}` : ''),
      cls: i.qty <= 0 ? 'bad' : i.out_qty > 0 ? 'warn' : 'ok',
    })),
  };
}

export default function Chat({ me }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [broken, setBroken] = useState([]);
  const [msgs, setMsgs] = useState([{ me: false, text: GREET }]);
  const [q, setQ] = useState('');
  const bodyRef = useRef();

  // โหลดจาก /api/dashboard ทีเดียว — ได้ทั้งของ (พร้อมผู้ยืม+ที่เก็บ) และของพัง/หาย
  useEffect(() => {
    if (!open) return;
    api('/api/dashboard').then((d) => { setItems(d.borrowedOut || []); setBroken(d.unitsOut || []); }).catch(() => {});
  }, [open]);

  useEffect(() => { bodyRef.current?.scrollTo(0, 1e9); }, [msgs, open]);

  const send = (e) => {
    e?.preventDefault();
    const text = q.trim();
    if (!text) return;
    const a = answer(text, items, broken, me) || { text: '🤔 ไม่เข้าใจ ลองใหม่' };
    setMsgs((m) => [...m, { me: true, text }, { me: false, ...a }]);
    setQ('');
  };

  return (
    <>
      <button className={'chat-fab' + (open ? ' hide' : '')} onClick={() => setOpen(true)} title="ถามสต็อก">💬</button>
      {open && (
        <div className="chat-panel">
          <header>
            <span>💬 ผู้ช่วยคลัง</span>
            <button className="chat-x" onClick={() => setOpen(false)}>✕</button>
          </header>
          <div className="chat-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={'chat-msg' + (m.me ? ' me' : '')}>
                <div className="bubble">
                  {m.text}
                  {m.rows && (
                    <div className="chat-rows">
                      {m.rows.map((r, j) => (
                        <div className="chat-row" key={j}>
                          <span className="cr-name">{r.name}</span>
                          <span className={'cr-val ' + r.cls}>{r.right}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={send}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์คำถาม…" autoFocus />
            <button className="btn primary small" type="submit">ส่ง</button>
          </form>
        </div>
      )}
    </>
  );
}
