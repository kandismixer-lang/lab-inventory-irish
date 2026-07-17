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
  if (!me) return <Login onLogin={setMe} />;
  return <Shell me={me} onLogout={() => setMe(null)} />;
}

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
  requests: { label: 'คำขอ', comp: Requests },
  log: { label: 'ประวัติทั้งหมด', comp: Log, adminOnly: true },
  users: { label: 'ผู้ใช้', comp: Users, adminOnly: true },
};

function Shell({ me, onLogout }) {
  const [view, setView] = useState('dashboard');
  const [changingPw, setChangingPw] = useState(false);
  const [badge, setBadge] = useState(0);
  const Comp = VIEWS[view].comp;

  const loadBadge = () => api('/api/requests/counts')
    .then((c) => setBadge(me.role === 'admin' ? (c.pending || 0) + (c.toHand || 0) : (c.toConfirm || 0)))
    .catch(() => {});
  useEffect(() => {
    loadBadge();
    const t = setInterval(loadBadge, 20000); // เช็คคำขอใหม่ทุก 20 วิ
    return () => clearInterval(t);
  }, [view]);

  const logout = async () => {
    await api('/api/logout', { method: 'POST' });
    onLogout();
  };

  return (
    <CartProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><span className="brand-logo" aria-hidden="true" /> คลัง IRiSH LAB</div>
          <nav className="tabs">
            {Object.entries(VIEWS).map(([k, v]) =>
              v.adminOnly && me.role !== 'admin' ? null : (
                <button key={k} className={'tab' + (view === k ? ' active' : '')} onClick={() => setView(k)}>
                  <span className="tab-label">{v.label}</span>
                  {k === 'requests' && badge > 0 && <span className="tab-badge">{badge}</span>}
                </button>
              )
            )}
          </nav>
          <div className="userbox">
            <span className="muted">{me.fullname || me.username} ({me.role})</span>
            <button className="btn small" onClick={() => setChangingPw(true)}>เปลี่ยนรหัส</button>
            <button className="btn small" onClick={logout}>ออก</button>
          </div>
        </aside>
        <main>
          <Comp me={me} />
        </main>
      </div>
      {changingPw && <ChangePw onClose={() => setChangingPw(false)} />}
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
