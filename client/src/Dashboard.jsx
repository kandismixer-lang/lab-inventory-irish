import React, { useEffect, useState } from 'react';
import { api, KIND_LABEL } from './api.js';
import { Table } from './components.jsx';
import { BrokenTable } from './Broken.jsx';

export function TxTable({ rows }) {
  return (
    <Table
      headers={['วันเวลา', 'รายการ', 'ประเภท', 'จำนวน', 'โดย/ผู้เกี่ยวข้อง', 'หมายเหตุ']}
      rows={rows.map((t) => ({
        key: t.id,
        cells: [
          t.created_at,
          t.item_name,
          <span className={'badge ' + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>,
          <span>{t.delta >= 0 ? '+' : ''}{t.delta} {t.unit || ''}</span>,
          <span>{t.person || '-'}<div className="hint">บันทึกโดย {t.by_user}</div></span>,
          t.note || '',
        ],
      }))}
    />
  );
}

export default function Dashboard({ go }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/dashboard').then(setD); }, []);
  if (!d) return <p className="muted">กำลังโหลด...</p>;

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

      <div className="section-title">🔧 เครื่องมือ (คงเหลือในคลัง = ไม่ถูกยืม)</div>
      <div className="hint" style={{ marginBottom: 6 }}>กดที่แถวเพื่อไปหน้ารายการของ (ยืม/จัดการ)</div>
      <Table
        headers={['ชื่อ', 'มีทั้งหมด', 'ถูกยืม', 'คงเหลือ']}
        rows={d.borrowedOut.map((i) => ({
          key: i.id,
          onClick: () => go && go('items', { itemId: i.id }),
          cells: [
            i.name,
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
      <TxTable rows={d.recent} />
    </>
  );
}
