import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Table, Modal, useToast } from './components.jsx';

export default function Users({ me }) {
  const [users, setUsers] = useState([]);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const load = () => api('/api/users').then(setUsers);
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm('ลบผู้ใช้นี้?')) return;
    await api('/api/users/' + id, { method: 'DELETE' });
    toast('ลบแล้ว');
    load();
  };

  return (
    <>
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setAdding(true)}>+ เพิ่มผู้ใช้</button>
      </div>
      <Table
        headers={['username', 'ชื่อ', 'สิทธิ์', 'สร้างเมื่อ', '']}
        rows={users.map((u) => ({
          key: u.id,
          cells: [
            u.username, u.fullname, u.role, u.created_at,
            u.id === me.id ? <span className="hint">คุณ</span> :
              <div className="row-actions"><button className="btn small danger" onClick={() => del(u.id)}>ลบ</button></div>,
          ],
        }))}
      />
      {adding && <UserForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); toast('สร้างแล้ว'); }} />}
    </>
  );
}

function UserForm({ onClose, onSaved }) {
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      onSaved();
    } catch (er) { setErr(er.message); }
  };
  return (
    <Modal title="เพิ่มผู้ใช้" onClose={onClose}>
      <form onSubmit={submit}>
        <label>username<input name="username" required /></label>
        <label>ชื่อ-สกุล<input name="fullname" /></label>
        <label>รหัสผ่าน (อย่างน้อย 6 ตัว)<input name="password" type="password" required /></label>
        <label>สิทธิ์
          <select name="role">
            <option value="staff">staff (ใช้งานทั่วไป)</option>
            <option value="admin">admin (จัดการทุกอย่าง)</option>
          </select>
        </label>
        <div className="err">{err}</div>
        <button className="btn primary" type="submit" style={{ marginTop: 14, width: '100%' }}>สร้างผู้ใช้</button>
      </form>
    </Modal>
  );
}
