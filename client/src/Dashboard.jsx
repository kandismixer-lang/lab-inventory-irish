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

export default function Dashboard({ go }) {
  const [d, setD] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { api('/api/dashboard').then(setD); }, []);
  if (!d) return <p className="muted">กำลังโหลด...</p>;

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
