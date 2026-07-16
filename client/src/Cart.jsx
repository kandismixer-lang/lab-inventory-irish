import React, { createContext, useContext, useState } from 'react';
import { api, TYPE_LABEL } from './api.js';
import { Modal, useToast, useConfirm } from './components.jsx';

const label = (i) => i.category || TYPE_LABEL[i.type];

const CartCtx = createContext({ cart: [], addToCart: () => {} });
export const useCart = () => useContext(CartCtx);

// เก็บตะกร้าไว้ระดับ global (คงข้ามการเปลี่ยนแท็บ) + แถบลอย + modal
export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const addToCart = (item, qty, note) => {
    setCart((p) => {
      const ex = p.find((c) => c.item.id === item.id);
      if (ex) return p.map((c) => c.item.id === item.id
        ? { ...c, qty: Math.min(item.qty, c.qty + qty), note: note || c.note } : c);
      return [...p, { item, qty, note }];
    });
    toast('เพิ่มลงตะกร้าแล้ว');
  };

  return (
    <CartCtx.Provider value={{ cart, addToCart }}>
      {children}
      <CartBar cart={cart} onOpen={() => setOpen(true)} />
      {open && <CartModal cart={cart} setCart={setCart} onClose={() => setOpen(false)} />}
    </CartCtx.Provider>
  );
}

function CartBar({ cart, onOpen }) {
  if (cart.length === 0) return null;
  const total = cart.reduce((s, c) => s + c.qty, 0);
  return (
    <button className="cart-bar" onClick={onOpen}>
      🛒 ตะกร้า <b>{cart.length}</b> รายการ · {total} ชิ้น <span className="cart-cta">ดูตะกร้า ▸</span>
    </button>
  );
}

function CartModal({ cart, setCart, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setQty = (id, q) => setCart((p) => p.map((c) => c.item.id === id
    ? { ...c, qty: Math.max(1, Math.min(c.item.qty, parseInt(q, 10) || 1)) } : c));
  const remove = async (c) => {
    if (!(await confirm({ title: 'ลบออกจากตะกร้า?', message: c.item.name }))) return;
    setCart((p) => p.filter((x) => x.item.id !== c.item.id));
  };
  const clearAll = async () => {
    if (!(await confirm({ title: 'ลบของทั้งหมดในตะกร้า?', message: `${cart.length} รายการจะถูกล้าง` }))) return;
    setCart([]);
    toast('ล้างตะกร้าแล้ว');
  };
  const submit = async () => {
    if (cart.length === 0) return;
    setBusy(true); setErr('');
    try {
      const r = await api('/api/orders', { method: 'POST', body: { note, items: cart.map((c) => ({ item_id: c.item.id, qty: c.qty, note: c.note })) } });
      setCart([]);
      onClose();
      toast(`ส่งออเดอร์แล้ว ${r.lines} รายการ`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="ตะกร้ายืม/เบิก" onClose={onClose}>
      {cart.length === 0 ? <p className="muted">— ตะกร้าว่าง —</p> : (
        <>
          <div className="cart-toolbar">
            <span className="muted">{cart.length} รายการ</span>
            <button className="btn small danger" onClick={clearAll}>ลบทั้งหมด</button>
          </div>
          <div className="cart-lines">
            {cart.map((c) => (
              <div key={c.item.id} className="cart-line">
                <div className="cart-line-info">
                  <strong>{c.item.name}</strong>
                  <span className="badge">{label(c.item)}</span>
                  {c.note ? <span className="hint">📝 {c.note}</span> : null}
                </div>
                <input type="number" min="1" max={c.item.qty} value={c.qty} onChange={(e) => setQty(c.item.id, e.target.value)} style={{ width: 66 }} />
                <button className="btn small danger" onClick={() => remove(c)}>ลบ</button>
              </div>
            ))}
          </div>
        </>
      )}
      <label style={{ marginTop: 10 }}>หมายเหตุออเดอร์ (ไม่บังคับ)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น งานแข่ง..." /></label>
      <div className="err">{err}</div>
      <button className="btn primary" disabled={cart.length === 0 || busy} onClick={submit} style={{ marginTop: 12, width: '100%' }}>
        {busy ? 'กำลังส่ง…' : `ยืนยันยืมทั้งหมด (${cart.length} รายการ)`}
      </button>
    </Modal>
  );
}
