import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from '../api.js';
import AdminCalendar from './AdminCalendar.jsx';
import AdminOrders from './AdminOrders.jsx';
import AdminCatalog from './AdminCatalog.jsx';
import AdminSchedule from './AdminSchedule.jsx';
import AdminSettings from './AdminSettings.jsx';
import AdminMessages from './AdminMessages.jsx';
import AdminCorporate from './AdminCorporate.jsx';
import AdminSiteText from './AdminSiteText.jsx';

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await api('/admin/login', { method: 'POST', body: { password } });
      onDone();
    } catch (err) { setError(err.message); }
  }
  return (
    <div className="page narrow">
      <h1>Owner sign in</h1>
      <form onSubmit={submit}>
        <label className="field"><span>Password</span>
          <input type="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn">Sign in</button>
      </form>
      <p><Link to="/">Back to the site</Link></p>
    </div>
  );
}

export default function Admin() {
  const [admin, setAdmin] = useState(null);
  useEffect(() => { api('/admin/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(false)); }, []);
  if (admin === null) return <div className="page narrow"><p>Loading…</p></div>;
  if (!admin) return <Login onDone={() => setAdmin(true)} />;

  async function signOut() {
    await api('/admin/logout', { method: 'POST' });
    setAdmin(false);
  }

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        <Link to="/" className="brand">SoleScape</Link>
        <NavLink end to="/admin">Calendar</NavLink>
        <NavLink to="/admin/messages">Messages</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/text">Site text</NavLink>
        <NavLink to="/admin/services">Services and products</NavLink>
        <NavLink to="/admin/corporate">Corporate clients</NavLink>
        <NavLink to="/admin/hours">Hours and time off</NavLink>
        <NavLink to="/admin/settings">Settings</NavLink>
        <button className="linkish" onClick={signOut}>Sign out</button>
      </nav>
      <div className="admin-body">
        <Routes>
          <Route index element={<AdminCalendar />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="text" element={<AdminSiteText />} />
          <Route path="services" element={<AdminCatalog />} />
          <Route path="corporate" element={<AdminCorporate />} />
          <Route path="hours" element={<AdminSchedule />} />
          <Route path="settings" element={<AdminSettings />} />
        </Routes>
      </div>
    </div>
  );
}
