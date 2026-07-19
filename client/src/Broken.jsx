import React, { useEffect, useState } from 'react';
import { api, STATUS_LABEL } from './api.js';
import { Table } from './components.jsx';

const FILTERS = [
  ['', 'ทั้งหมด'],
  ['repair', 'พัง / ซ่อม'],
  ['lost', 'หาย'],
];

// รวมหน่วยของ item เดียวกัน + สถานะเดียวกัน ให้อยู่แถวเดียว
function group(rows) {
  const map = new Map();
  for (const u of rows) {
    const key = u.item_id + '|' + u.status;
    if (!map.has(key)) map.set(key, { ...u, codes: [] });
    map.get(key).codes.push(u.code);
  }
  return [...map.values()];
}

export default function Broken() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { api('/api/broken').then(setRows); }, []);
  if (!rows) return <p className="muted">กำลังโหลด...</p>;

  const kw = q.trim().toLowerCase();
  const filtered = rows.filter(
    (u) =>
      (!f || u.status === f) &&
      (!kw || u.item_name.toLowerCase().includes(kw) || u.code.toLowerCase().includes(kw))
  );
  const g = group(filtered);
  const n = (s) => rows.filter((u) => u.status === s).length;

  return (
    <>
      <div className="section-title">🛠️ ของพัง / หาย</div>
      <div className="hint" style={{ marginBottom: 8 }}>
        หน่วยที่ตัดออกจากคลังแล้ว — ไม่นับรวมใน "มีทั้งหมด" · ซ่อมเสร็จ/กู้คืนได้ที่ Stock Check หน้ารายการของ
      </div>

      <div className="stock-summary">
        <span>ทั้งหมด <b>{rows.length}</b></span>
        <span className="bstat-repair">พัง <b>{n('repair')}</b></span>
        <span className="bstat-lost">หาย <b>{n('lost')}</b></span>
      </div>

      <div className="subtabs wrap">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={'btn small' + (f === k ? ' active' : '')} onClick={() => setF(k)}>{label}</button>
        ))}
      </div>

      {rows.length > 8 && (
        <input type="search" className="stock-search" placeholder="ค้นหาชื่อของ / รหัส…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      <Table
        headers={['รายการ', 'สถานะ', 'จำนวน', 'รหัส']}
        rows={g.map((u) => ({
          key: u.item_id + u.status,
          cells: [
            <span><strong>{u.item_name}</strong>{u.category && <div className="hint">{u.category}</div>}</span>,
            <span className={'badge st-' + u.status}>{STATUS_LABEL[u.status]}</span>,
            <span className="col-out"><b>{u.codes.length}</b> {u.unit || ''}</span>,
            <span className="code-chips">
              {u.codes.map((c) => <span className="code-chip" key={c}>{c}</span>)}
            </span>,
          ],
        }))}
      />
    </>
  );
}
