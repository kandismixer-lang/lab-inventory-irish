import React, { createContext, useContext, useState } from 'react';
import { api, TYPE_LABEL } from './api.js';
import { Modal, useToast, useConfirm } from './components.jsx';

const label = (i) => i.category || TYPE_LABEL[i.type];

const CartCtx = createContext({ cart: [], addToCart: () => {} });
export const useCart = () => useContext(CartCtx);

// เก็บตะกร้าไว้ระดับ global (คงข้ามการเปลี่ยนแท็บ) + แถบลอย + modal
export function CartProvider({ children, person }) {
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const addToCart = (item, qty, note, who, due) => {
    setCart((p) => {
      const ex = p.find((c) => c.item.id === item.id);
      if (ex) return p.map((c) => c.item.id === item.id
        ? { ...c, qty: Math.min(item.qty, c.qty + qty), note: note || c.note, who: who || c.who, due: due || c.due } : c);
      return [...p, { item, qty, note, who, due }];
    });
    toast('เพิ่มลงตะกร้าแล้ว');
  };

  return (
    <CartCtx.Provider value={{ cart, addToCart }}>
      {children}
      <CartBar cart={cart} onOpen={() => setOpen(true)} />
      {open && <CartModal cart={cart} setCart={setCart} person={person} onClose={() => setOpen(false)} />}
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

function CartModal({ cart, setCart, person, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
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
  // optimistic: ล้างตะกร้า+ปิด+เด้ง toast ทันที ยิง API เบื้องหลัง — ถ้า fail คืนของกลับตะกร้า
  const submit = () => {
    if (cart.length === 0) return;
    const who = cart.find((c) => c.who && c.who.trim())?.who?.trim() || person;
    const snapshot = cart; // เก็บไว้เผื่อต้อง restore
    const body = { note, person: who, items: cart.map((c) => ({ item_id: c.item.id, qty: c.qty, note: c.note, due_date: c.due || '' })) };
    setCart([]);
    onClose();
    toast(`ส่งคำขอแล้ว ${snapshot.length} รายการ — รอแอดมินอนุมัติ`);
    api('/api/orders', { method: 'POST', body }).catch((e) => {
      setCart((cur) => (cur.length === 0 ? snapshot : cur)); // ยังไม่เพิ่มอะไรใหม่ = คืนของเดิม
      toast('ส่งคำขอไม่สำเร็จ ของกลับเข้าตะกร้าแล้ว: ' + e.message);
    });
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
                  {c.who ? <span className="hint">👤 {c.who}</span> : null}
                  {c.due ? <span className="hint">📅 คืน {c.due}</span> : null}
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
      <button className="btn primary" disabled={cart.length === 0} onClick={submit} style={{ marginTop: 12, width: '100%' }}>
        ยืนยันยืมทั้งหมด ({cart.length} รายการ)
      </button>
    </Modal>
  );
}
