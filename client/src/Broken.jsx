import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Table, useToast, useConfirm } from './components.jsx';

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
    map.get(u.item_id)[u.status].push(u);
  }
  return [...map.values()];
}

// รหัสหน่วย + ปุ่มกู้กลับคลัง (admin เท่านั้น)
function Codes({ list, cls, label, onFix }) {
  if (list.length === 0) return <span className="muted">—</span>;
  return (
    <span className="code-chips">
      {list.map((u) => (
        <span className={'code-chip ' + cls} key={u.id}>
          {u.code}
          {onFix && (
            <button className="chip-fix" title={label} onClick={() => onFix(u)}>✓ {label}</button>
          )}
        </span>
      ))}
    </span>
  );
}

export default function Broken({ me }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = me.role === 'admin';

  const load = () => api('/api/broken').then(setRows);
  useEffect(() => { load(); }, []);

  // ซ่อมเสร็จ / กู้คืน — คืนหน่วยกลับเป็น available
  const fix = async (u, label) => {
    if (!(await confirm({ title: `${label} — ${u.code}?`, message: `${u.item_name} จะกลับเข้าคลังเป็นสถานะ "ว่าง"` }))) return;
    try {
      await api(`/api/units/${u.id}/move`, { method: 'POST', body: { action: 'ready' } });
      toast(`${u.code}: ${label} แล้ว`);
      load();
    } catch (e) { toast(e.message); }
  };
  if (!rows) return <p className="muted">กำลังโหลด...</p>;

  const kw = q.trim().toLowerCase();
  const filtered = rows.filter(
    (u) =>
      (!f || u.status === f) &&
      (!kw || u.item_name.toLowerCase().includes(kw) || u.code.toLowerCase().includes(kw))
  );
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

      <BrokenTable rows={filtered} onFix={isAdmin ? fix : null} />
    </>
  );
}

// ตารางของพัง/หาย — ใช้ร่วมกับแดชบอร์ด
export function BrokenTable({ rows, onFix }) {
  const g = group(rows);
  return (
    <Table
      headers={[
        'รายการ',
        <span className="bstat-repair">พัง</span>,
        <span className="bstat-lost">หาย</span>,
        'รวม',
        'หมายเหตุ',
      ]}
      rows={g.map((u) => {
        const all = [...u.repair, ...u.lost];
        const notes = [...new Set(all.map((x) => x.holder).filter(Boolean))];
        return {
          key: u.item_id,
          cells: [
            <span><strong>{u.item_name}</strong>{u.category && <div className="hint">{u.category}</div>}</span>,
            <Codes list={u.repair} cls="cc-repair" label="ซ่อมเสร็จ" onFix={onFix ? (x) => onFix(x, 'ซ่อมเสร็จ') : null} />,
            <Codes list={u.lost} cls="cc-lost" label="กู้คืน" onFix={onFix ? (x) => onFix(x, 'กู้คืน') : null} />,
            <span className="col-out"><b>{all.length}</b> {u.unit || ''}</span>,
            notes.length ? <span className="muted">{notes.join(', ')}</span> : <span className="muted">-</span>,
          ],
        };
      })}
    />
  );
}
