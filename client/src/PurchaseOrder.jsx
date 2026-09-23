import React, { useEffect, useState } from 'react';
import { api, fileToScaledDataURL, CATEGORY_GROUPS } from './api.js';
import { useToast, useConfirm } from './components.jsx';

const ALL_CATS = CATEGORY_GROUPS.flatMap((g) => g.cats);

// เมนูแยก "อ่านใบสั่งซื้อด้วย AI" (MVP) — อัปโหลดรูปใบ → AI ดึงรายการ → admin ยืนยัน → เข้าคลัง
// ใช้ API เดิม (/api/items, /api/items/:id/move) ตอนบันทึก ไม่มีลอจิกสต็อกใหม่
export default function PurchaseOrder({ me }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState(null); // { enabled, model }
  const [img, setImg] = useState('');         // data URL รูปที่เลือก
  const [rows, setRows] = useState([]);       // รายการที่ AI ดึงได้ (แก้ได้)
  const [items, setItems] = useState([]);     // ของเดิมในคลัง (สำหรับ "เติมของเดิม")
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/po/status').then(setStatus).catch(() => setStatus({ enabled: false }));
    // เอาเฉพาะของนับจำนวน (ไม่ track รายตัว/ไม่ใช่หุ่น) มาให้เลือกเติม
    api('/api/items').then((list) => setItems(list.filter((i) => !i.tracked && !i.is_kit))).catch(() => {});
  }, []);

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImg(await fileToScaledDataURL(f, 1600, 0.75)); // ใบมีตัวหนังสือเล็ก ย่อไม่มากเพื่อให้อ่านออก
    setRows([]);
  };

  const parse = async () => {
    if (!img) return toast('เลือกรูปใบก่อน');
    setBusy(true);
    try {
      const r = await api('/api/po/parse', { method: 'POST', body: { image: img } });
      const list = (r.items || []).map((it) => ({ ...it, target: 'new' })); // ค่าเริ่ม: สร้างใหม่
      setRows(list);
      toast(list.length ? `อ่านได้ ${list.length} รายการ — ตรวจแล้วกดบันทึก` : 'ไม่พบรายการในใบ');
    } catch (e) {
      toast('อ่านใบไม่สำเร็จ: ' + e.message);
    } finally { setBusy(false); }
  };

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const delRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  const save = async () => {
    if (rows.length === 0) return;
    if (!(await confirm({
      title: `บันทึกเข้าคลัง ${rows.length} รายการ?`,
      message: 'ของใหม่จะถูกสร้าง · ของเดิมจะถูกเติมยอด — ตรวจจำนวน/หมวดให้ถูกก่อนนะ',
      danger: false, okClass: 'ok',
    }))) return;
    setSaving(true);
    let ok = 0; const fail = [];
    for (const r of rows) {
      try {
        if (r.target === 'new') {
          await api('/api/items', { method: 'POST', body: {
            name: r.name, category: r.category, unit: r.unit, qty: r.qty, note: r.note,
          } });
        } else {
          await api(`/api/items/${r.target}/move`, { method: 'POST', body: {
            kind: 'add', qty: r.qty, note: 'รับเข้าจากใบสั่งซื้อ (AI)',
          } });
        }
        ok++;
      } catch (e) { fail.push(`${r.name} (${e.message})`); }
    }
    setSaving(false);
    setRows([]); setImg('');
    api('/api/items').then((list) => setItems(list.filter((i) => !i.tracked && !i.is_kit))).catch(() => {});
    toast(fail.length ? `เข้าคลัง ${ok} รายการ · พลาด: ${fail.join(', ')}` : `เข้าคลังครบ ${ok} รายการ 🎉`);
  };

  return (
    <>
      <div className="section-title">📄 อ่านใบสั่งซื้อด้วย AI <span className="badge st-handed">ทดลอง</span></div>

      {status && !status.enabled && (
        <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: '4px solid var(--warn)' }}>
          <b>ยังเปิดใช้ไม่ได้</b> — ต้องตั้งค่า <code>ANTHROPIC_API_KEY</code> บนเซิร์ฟเวอร์ (Render → Environment) ก่อน
          <div className="muted" style={{ marginTop: 6 }}>ขอ key ได้ที่ console.anthropic.com แล้วเติมเงินขั้นต่ำ · ใบละไม่กี่สตางค์</div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="muted" style={{ marginBottom: 10 }}>
          1) ถ่าย/เลือกรูปใบสั่งซื้อ → 2) กด "อ่านใบ" → 3) ตรวจแก้ตาราง → 4) บันทึกเข้าคลัง
          {status?.model && <span className="hint"> · โมเดล: {status.model}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept="image/*" capture="environment" onChange={pickFile} disabled={!status?.enabled} />
          <button className="btn primary" onClick={parse} disabled={!img || busy || !status?.enabled}>
            {busy ? 'กำลังอ่าน…' : '🔍 อ่านใบ'}
          </button>
        </div>
        {img && (
          <img src={img} alt="ใบสั่งซื้อ" style={{ maxWidth: '100%', maxHeight: 260, marginTop: 12, borderRadius: 8, display: 'block' }} />
        )}
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <b>ตรวจรายการ ({rows.length})</b>
            <button className="btn ok" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก…' : '✓ บันทึกเข้าคลัง'}</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="po-table">
              <thead>
                <tr><th>ชื่อ</th><th>จำนวน</th><th>หน่วย</th><th>หมวด</th><th>ปลายทาง</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} /></td>
                    <td><input type="number" min="1" value={r.qty} style={{ width: 64 }}
                      onChange={(e) => setRow(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></td>
                    <td><input value={r.unit} style={{ width: 70 }} onChange={(e) => setRow(i, { unit: e.target.value })} /></td>
                    <td>
                      <select value={r.category} onChange={(e) => setRow(i, { category: e.target.value })}>
                        {ALL_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.target} onChange={(e) => setRow(i, { target: e.target.value })}>
                        <option value="new">➕ สร้างของใหม่</option>
                        {items.map((it) => <option key={it.id} value={it.id}>เติม: {it.name}</option>)}
                      </select>
                    </td>
                    <td><button className="btn small danger" onClick={() => delRow(i)}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            ⚠️ AI อาจอ่านผิดได้ — ตรวจจำนวน/หมวดทุกแถวก่อนบันทึก · "เติม" ใช้ได้กับของนับจำนวน (ไม่ใช่ของ track รายตัว/หุ่น)
          </div>
        </div>
      )}
    </>
  );
}
