import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Table } from './components.jsx';

const FILTERS = [
  ['', 'ทั้งหมด'],
  ['repair', 'พัง / ซ่อม'],
  ['lost', 'หาย'],
];

// 1 item = 1 แถว, แยกรหัสเป็นคอลัมน์ พัง / หาย
function group(rows) {
  const map = new Map();
  for (const u of rows) {
    if (!map.has(u.item_id)) map.set(u.item_id, { ...u, repair: [], lost: [] });
    map.get(u.item_id)[u.status].push(u.code);
  }
  return [...map.values()];
}

function Codes({ list, cls }) {
  if (list.length === 0) return <span className="muted">—</span>;
  return (
    <span className="code-chips">
      {list.map((c) => <span className={'code-chip ' + cls} key={c}>{c}</span>)}
    </span>
  );
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
        headers={[
          'รายการ',
          <span className="bstat-repair">พัง</span>,
          <span className="bstat-lost">หาย</span>,
          'รวม',
        ]}
        rows={g.map((u) => ({
          key: u.item_id,
          cells: [
            <span><strong>{u.item_name}</strong>{u.category && <div className="hint">{u.category}</div>}</span>,
            <Codes list={u.repair} cls="cc-repair" />,
            <Codes list={u.lost} cls="cc-lost" />,
            <span className="col-out"><b>{u.repair.length + u.lost.length}</b> {u.unit || ''}</span>,
          ],
        }))}
      />
    </>
  );
}
