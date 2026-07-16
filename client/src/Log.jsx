import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { TxTable } from './Dashboard.jsx';

export default function Log() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/api/transactions').then(setRows); }, []);
  if (!rows) return <p className="muted">กำลังโหลด...</p>;
  return (
    <>
      <div className="section-title">ประวัติการเคลื่อนไหวทั้งหมด (300 รายการล่าสุด)</div>
      <TxTable rows={rows} />
    </>
  );
}
