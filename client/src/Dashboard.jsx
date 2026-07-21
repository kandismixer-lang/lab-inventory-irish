import React, { useEffect, useState } from 'react';
import { api, KIND_LABEL } from './api.js';
import { Table } from './components.jsx';
import { BrokenTable } from './Broken.jsx';
import { CategoryBar, catLabel } from './Items.jsx';

// note เก่าบางแถวเก็บรหัสหน่วยไว้ — แยกออกมาเป็นคอลัมน์รหัส เหลือข้อความจริงไว้ในหมายเหตุ
const CODE_RE = /^[A-Za-z][A-Za-z0-9]*[-_]?\d+$/;
function splitNote(t) {
  const note = (t.note || '').trim();
  if (t.unit_code) return { code: t.unit_code, note: note === t.unit_code ? '' : note };
  const parts = note.split(/\s*,\s*/).filter(Boolean);
  const codes = parts.filter((p) => CODE_RE.test(p));
  return { code: codes.join(', '), note: parts.filter((p) => !CODE_RE.test(p)).join(', ') };
}

export function TxTable({ rows, pageSize = 0 }) {
  const [page, setPage] = useState(1);
  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const p = Math.min(page, pages);
  const shown = pageSize ? rows.slice((p - 1) * pageSize, p * pageSize) : rows;

  return (
    <>
      <Table
        headers={['วันเวลา', 'รายการ', 'ประเภท', 'จำนวน', 'โดย/ผู้เกี่ยวข้อง', 'รหัส', 'หมายเหตุ']}
        rows={shown.map((t) => {
          const s = splitNote(t);
          return {
            key: t.id,
            cells: [
              t.created_at,
              t.item_name,
              <span className={'badge ' + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>,
              <span>{t.delta >= 0 ? '+' : ''}{t.delta} {t.unit || ''}</span>,
              <span>{t.person || '-'}<div className="hint">บันทึกโดย {t.by_user}</div></span>,
              s.code ? <span className="code-chip">{s.code}</span> : <span className="muted">—</span>,
              s.note || <span className="muted">—</span>,
            ],
          };
        })}
      />
      {pages > 1 && (
        <div className="pager">
          <button className="btn small" disabled={p <= 1} onClick={() => setPage(p - 1)}>‹ ก่อนหน้า</button>
          <span className="muted">หน้า <b>{p}</b> / {pages} · {rows.length} รายการ</span>
          <button className="btn small" disabled={p >= pages} onClick={() => setPage(p + 1)}>ถัดไป ›</button>
        </div>
      )}
    </>
  );
}

export default function Dashboard({ go, me }) {
  const [d, setD] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { api('/api/dashboard').then(setD); }, []);
  if (!d) return <p className="muted">กำลังโหลด...</p>;

  // ของที่ "ฉัน" ยืมอยู่ — เทียบชื่อผู้ยืมกับชื่อผู้ใช้/ชื่อที่ตั้งไว้
  const myName = (me?.fullname || me?.username || '').trim().toLowerCase();
  const hasName = myName && myName !== 'guest' && myName !== 'ผู้เยี่ยมชม';
  const mine = [];
  if (hasName) d.borrowedOut.forEach((i) => (i.borrowers || []).forEach((b) => {
    if ((b.person || '').trim().toLowerCase() === myName) mine.push({ name: i.name, code: b.label, id: i.id });
  }));

  // ยืม/ใช้จนไม่เหลือในคลัง (แต่ยังมีของในระบบ) — เตือนแยกจากของสิ้นเปลืองใกล้หมด
  const outOfStock = d.borrowedOut.filter((i) => i.qty <= 0 && i.total_qty > 0);
  const kw = q.trim().toLowerCase();
  const list = d.borrowedOut.filter(
    (i) => (!cat || catLabel(i) === cat) && (!kw || i.name.toLowerCase().includes(kw) || (i.location || '').toLowerCase().includes(kw))
  );

  return (
    <>
      <div className="stat-row">
        <div className="card stat"><div className="num col-total">{d.totals.total}</div><div className="lbl">จำนวนรวม</div></div>
        <div className="card stat"><div className="num col-out">{d.totals.out}</div><div className="lbl">ถูกยืม / ถูกใช้</div></div>
        <div className="card stat"><div className="num col-remain">{d.totals.remain}</div><div className="lbl">คงเหลือในคลัง</div></div>
      </div>

      {d.overdue && d.overdue.length > 0 && (() => {
        const late = d.overdue.filter((r) => r.days_over > 0).length;
        return (
          <>
            <div className="section-title">📅 กำหนดคืน ({d.overdue.length}{late ? ` · เกิน ${late}` : ''})</div>
            <Table
              headers={['รายการ', 'ผู้ยืม', 'กำหนดคืน', 'สถานะ']}
              rows={d.overdue.map((r) => ({
                key: r.id,
                cells: [
                  <span>{r.item_name} <span className="muted">×{r.qty}</span></span>,
                  r.who || r.requester_fullname || r.requester_name || '-',
                  <span className={r.days_over > 0 ? 'col-out' : 'col-remain'}>{r.due_date}</span>,
                  r.days_over > 0
                    ? <span className="badge low">เกิน {r.days_over} วัน</span>
                    : r.days_over === 0
                      ? <span className="badge" style={{ background: 'rgba(250,204,21,.15)', color: '#facc15' }}>ครบวันนี้</span>
                      : <span className="muted">เหลือ {-r.days_over} วัน</span>,
                ],
              }))}
            />
          </>
        );
      })()}

      {mine.length > 0 && (
        <>
          <div className="section-title">🙋 ของที่คุณยืมอยู่ ({mine.length})</div>
          <Table
            headers={['รายการ', 'รหัส']}
            rows={mine.map((m, i) => ({
              key: i,
              onClick: () => go && go('items', { itemId: m.id }),
              cells: [m.name, m.code ? <span className="code-chip">{m.code}</span> : <span className="muted">—</span>],
            }))}
          />
        </>
      )}

      {d.lowStock.length > 0 && (
        <>
          <div className="section-title">⚠️ ของใกล้หมด</div>
          <Table
            headers={['ชื่อ', 'คงเหลือ', 'จุดเตือน', 'ที่เก็บ']}
            rows={d.lowStock.map((i) => ({
              key: i.id,
              cells: [i.name, <span className="badge low">{i.qty} {i.unit}</span>, i.min_qty, i.location],
            }))}
          />
        </>
      )}

      {outOfStock.length > 0 && (
        <>
          <div className="section-title">🚫 หมดคลัง (ถูกยืม/ใช้จนไม่เหลือ)</div>
          <div className="hint" style={{ marginBottom: 6 }}>ยังมีของในระบบแต่ตอนนี้ไม่เหลือให้ยืม — รอคืน</div>
          <Table
            headers={['ชื่อ', 'มีทั้งหมด', 'ถูกยืม/ใช้', 'คงเหลือ']}
            rows={outOfStock.map((i) => ({
              key: i.id,
              onClick: () => go && go('items', { itemId: i.id }),
              cells: [
                <span>{i.name}<span className={'badge ' + i.type} style={{ marginLeft: 8 }}>{catLabel(i)}</span></span>,
                <span className="col-total">{i.total_qty} {i.unit}</span>,
                <span className="col-out">{i.out_qty} {i.unit}</span>,
                <span className="badge low">0 {i.unit}</span>,
              ],
            }))}
          />
        </>
      )}

      <div className="section-title">📦 รายการของ (คงเหลือในคลัง = ไม่ถูกยืม/ใช้)</div>
      <div className="hint" style={{ marginBottom: 6 }}>กดที่แถวเพื่อไปหน้ารายการของ (ยืม/จัดการ) · กดหมวดเพื่อกรอง</div>
      <input type="search" className="stock-search" placeholder="ค้นหาชื่อ / ที่เก็บ…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <CategoryBar items={d.borrowedOut} cat={cat} onPick={setCat} />
      <Table
        headers={['ชื่อ', 'มีทั้งหมด', 'ถูกใช้/ยืม', 'คงเหลือ']}
        rows={list.map((i) => ({
          key: i.id,
          onClick: () => go && go('items', { itemId: i.id }),
          cells: [
            <span>{i.name}<span className={'badge ' + i.type} style={{ marginLeft: 8 }}>{catLabel(i)}</span></span>,
            <span className="col-total">{i.total_qty} {i.unit}</span>,
            i.out_qty > 0
              ? <span className="col-out">{i.out_qty} {i.unit}</span>
              : <span className="muted">—</span>,
            <span className="col-remain">{i.qty} {i.unit}</span>,
          ],
        }))}
      />

      {d.unitsOut && d.unitsOut.length > 0 && (
        <>
          <div className="section-title">🗑️ หน่วยที่ตัดออกจากคลัง (พัง/หาย)</div>
          <div className="hint" style={{ marginBottom: 6 }}>ไม่นับรวมใน "มีทั้งหมด" แล้ว — ซ่อมเสร็จ/กู้คืนได้ที่ Stock Check</div>
          <BrokenTable rows={d.unitsOut} />
        </>
      )}

      <div className="section-title">🕑 ความเคลื่อนไหวล่าสุด</div>
      <TxTable rows={d.recent.slice(0, 15)} />
    </>
  );
}
