import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { ToastProvider, DialogProvider, Modal, useToast } from './components.jsx';
import { CartProvider } from './Cart.jsx';
import Dashboard from './Dashboard.jsx';
import Items from './Items.jsx';
import Log from './Log.jsx';
import Users from './Users.jsx';
import Requests from './Requests.jsx';

export default function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <Root />
      </DialogProvider>
    </ToastProvider>
  );
}

function Root() {
  const [me, setMe] = useState(undefined); // undefined=กำลังเช็ค, null=ยังไม่ login
  useEffect(() => {
    api('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) return null;
  // ไม่ login = guest (server คืน role 'guest') — ดูแดชบอร์ด/รายการของได้ ไม่เห็นคำขอ/ผู้ใช้
  return <Shell me={me || { role: 'guest', username: 'guest' }} onMe={setMe} />;
}

// popup เข้าสู่ระบบ (เรียกจากปุ่มซ้ายล่าง)
function LoginModal({ onClose, onLogin }) {
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      onLogin(await api('/api/login', {
        method: 'POST',
        body: { username: f.username.value, password: f.password.value },
      }));
    } catch (er) { setErr(er.message); }
  };
  return (
    <Modal title="เข้าสู่ระบบ" onClose={onClose}>
      <form onSubmit={submit}>
        <label>ชื่อผู้ใช้<input name="username" autoComplete="username" autoFocus required /></label>
        <label>รหัสผ่าน<input name="password" type="password" autoComplete="current-password" required /></label>
        <div className="err">{err}</div>
        <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>เข้าสู่ระบบ</button>
      </form>
    </Modal>
  );
}

// หน้า splash เต็มจอ (สำรองไว้ ถ้าจะกลับไปบังคับ login ก่อนเข้า)
function Login({ onLogin }) {
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const user = await api('/api/login', {
        method: 'POST',
        body: { username: f.username.value, password: f.password.value },
      });
      onLogin(user);
    } catch (er) { setErr(er.message); }
  };
  return (
    <div className="login-wrap">
      <div className="login-fx" aria-hidden="true">
        <span className="fx-grid" />
        <span className="fx-glow fx-glow-a" />
        <span className="fx-glow fx-glow-b" />
        <span className="fx-stars" />
      </div>

      <div className="login-hero">
        <div className="login-mark">
          <span className="mark-ring" aria-hidden="true" />
          <span className="brand-logo full" aria-hidden="true" />
        </div>
        <div className="login-tagline">Intelligent Robot &amp; Industrial System Hub</div>
      </div>

      <form className="card login-card" onSubmit={submit}>
        <h1>Inventory IRiSH Lab</h1>
        <p className="muted">เข้าสู่ระบบเพื่อใช้งาน</p>
        <label>ชื่อผู้ใช้<input name="username" autoComplete="username" required /></label>
        <label>รหัสผ่าน<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn primary" type="submit">เข้าสู่ระบบ</button>
        <div className="err">{err}</div>
      </form>
    </div>
  );
}

const VIEWS = {
  dashboard: { label: 'แดชบอร์ด', comp: Dashboard },
  items: { label: 'รายการของ', comp: Items },
  log: { label: 'ประวัติทั้งหมด', comp: Log },
  requests: { label: 'คำขอ', comp: Requests, needLogin: true },
  users: { label: 'ผู้ใช้', comp: Users, adminOnly: true },
};
// เมนูนี้เห็นได้ไหม
const canSee = (v, me) =>
  !(v.adminOnly && me.role !== 'admin') && !(v.needLogin && me.role === 'guest');

function Shell({ me, onMe }) {
  const [view, setView] = useState('dashboard');
  const [changingPw, setChangingPw] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [badge, setBadge] = useState(0);
  const [focusItem, setFocusItem] = useState(null); // id ของของที่จะให้หน้ารายการเปิดรอ
  const isGuest = me.role === 'guest';
  const Comp = VIEWS[view].comp;

  // เปลี่ยนหน้า + สั่งโฟกัสของ (จากแดชบอร์ด)
  const go = (v, payload) => {
    setView(v);
    if (payload?.itemId) setFocusItem(payload.itemId);
  };

  // ถ้าสิทธิ์เปลี่ยน (login/ออก) แล้วอยู่หน้าที่ดูไม่ได้ → เด้งกลับแดชบอร์ด
  useEffect(() => {
    if (!canSee(VIEWS[view], me)) setView('dashboard');
  }, [me.role]);

  const loadBadge = () => {
    if (isGuest) { setBadge(0); return; }
    api('/api/requests/counts')
      .then((c) => setBadge(me.role === 'admin' ? (c.pending || 0) + (c.toHand || 0) : (c.toConfirm || 0)))
      .catch(() => {});
  };
  useEffect(() => {
    loadBadge();
    const t = setInterval(loadBadge, 20000); // เช็คคำขอใหม่ทุก 20 วิ
    return () => clearInterval(t);
  }, [view, me.role]);

  const logout = async () => {
    await api('/api/logout', { method: 'POST' });
    onMe({ role: 'guest', username: 'guest' });
    setView('dashboard');
  };

  return (
    <CartProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><span className="brand-logo" aria-hidden="true" /> คลัง IRiSH LAB</div>
          <nav className="tabs">
            {Object.entries(VIEWS).map(([k, v]) =>
              !canSee(v, me) ? null : (
                <button key={k} className={'tab' + (view === k ? ' active' : '')} onClick={() => setView(k)}>
                  <span className="tab-label">{v.label}</span>
                  {k === 'requests' && badge > 0 && <span className="tab-badge">{badge}</span>}
                </button>
              )
            )}
          </nav>
          <div className="userbox">
            {isGuest ? (
              <button className="btn primary" onClick={() => setLoggingIn(true)}>เข้าสู่ระบบ</button>
            ) : (
              <>
                <span className="muted">{me.fullname || me.username} ({me.role})</span>
                <button className="btn small" onClick={() => setChangingPw(true)}>เปลี่ยนรหัส</button>
                <button className="btn small" onClick={logout}>ออก</button>
              </>
            )}
          </div>
        </aside>
        <main>
          <Comp me={me} go={go} focusItem={focusItem} onFocused={() => setFocusItem(null)} />
        </main>
        {view !== 'items' && (
          <button className="borrow-fab" onClick={() => setView('items')}>
            <span className="fab-pulse" aria-hidden="true" />
            🛒 ยืมของ กดที่นี่
          </button>
        )}
      </div>
      {changingPw && <ChangePw onClose={() => setChangingPw(false)} />}
      {loggingIn && <LoginModal onClose={() => setLoggingIn(false)} onLogin={(u) => { onMe(u); setLoggingIn(false); }} />}
    </CartProvider>
  );
}

function ChangePw({ onClose }) {
  const toast = useToast();
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/change-password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('เปลี่ยนรหัสแล้ว');
      onClose();
    } catch (er) { setErr(er.message); }
  };
  return (
    <Modal title="เปลี่ยนรหัสผ่าน" onClose={onClose}>
      <form onSubmit={submit}>
        <label>รหัสผ่านเดิม<input name="oldPassword" type="password" required /></label>
        <label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)<input name="newPassword" type="password" required /></label>
        <div className="err">{err}</div>
        <button className="btn primary" type="submit" style={{ marginTop: 14, width: '100%' }}>เปลี่ยนรหัสผ่าน</button>
      </form>
    </Modal>
  );
}
