import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const today = new Date().toLocaleDateString('en-CA');
const inAWeek = new Date(Date.now() + 6 * 864e5).toLocaleDateString('en-CA');
const blank = { title: '', description: '', service_ids: [], discount_type: 'percent', discount_value: '', starts_on: today, ends_on: inAWeek };
const STATE = { active: 'On now', scheduled: 'Scheduled', ended: 'Ended' };
const niceDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default function AdminSpecials() {
  const [rows, setRows] = useState(null);
  const [basis, setBasis] = useState('booking');
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(() => {
    api('/admin/specials').then((r) => { setRows(r.specials); setBasis(r.date_basis); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { api('/admin/catalog').then((r) => setServices(r.services.filter((s) => s.active))).catch(() => {}); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (id) => setForm({ ...form, service_ids: form.service_ids.includes(id) ? form.service_ids.filter((x) => x !== id) : [...form.service_ids, id] });

  function edit(sp) {
    setEditing(sp.id); setSaved(''); setError('');
    setForm({ ...sp, discount_value: sp.discount_type === 'amount' ? sp.discount_value / 100 : sp.discount_value });
  }
  function reset() { setEditing(null); setForm(blank); }

  async function save(e) {
    e.preventDefault(); setError(''); setSaved('');
    try {
      await api(editing ? `/admin/specials/${editing}` : '/admin/specials', { method: editing ? 'PATCH' : 'POST', body: form });
      setSaved(editing ? 'Special updated.' : 'Special saved.'); reset(); load();
    } catch (err) { setError(err.message); }
  }
  async function remove(sp) {
    if (!window.confirm(`Delete "${sp.title}"? Bookings that already got this discount keep it.`)) return;
    try { await api(`/admin/specials/${sp.id}`, { method: 'DELETE' }); if (editing === sp.id) reset(); load(); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <h1>Specials</h1>
      <p>A special shows a banner on the Home and Services pages and takes the discount off automatically. Only one special can run at a time, and it turns off by itself after its end date.</p>
      <p className="note">
        The discount applies to {basis === 'appointment' ? 'appointments that fall between the start and end dates' : 'bookings made between the start and end dates, whatever day the appointment is'}.
        {' '}Change this in <Link to="/admin/settings">Settings</Link>.
      </p>
      {saved && <p className="success" role="status">{saved}</p>}

      <form className="panel" onSubmit={save} noValidate>
        <h2>{editing ? 'Edit special' : 'New special'}</h2>
        <label className="field"><span>Title</span><input value={form.title} onChange={set('title')} required /></label>
        <label className="field"><span>Description (shown in the banner)</span><textarea rows="3" value={form.description} onChange={set('description')} /></label>
        <fieldset className="choice-group">
          <legend>Services</legend>
          {services.map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={() => toggle(s.id)} /><span>{s.name}</span></label>
          ))}
        </fieldset>
        <div className="two">
          <label className="field"><span>Discount type</span>
            <select value={form.discount_type} onChange={set('discount_type')}>
              <option value="percent">Percent off</option>
              <option value="amount">Dollars off</option>
            </select></label>
          <label className="field"><span>{form.discount_type === 'percent' ? 'Percent off' : 'Dollars off'}</span>
            <input inputMode="decimal" value={form.discount_value} onChange={set('discount_value')} required /></label>
        </div>
        <div className="two">
          <label className="field"><span>Start date</span><input type="date" value={form.starts_on} onChange={set('starts_on')} required /></label>
          <label className="field"><span>End date</span><input type="date" value={form.ends_on} onChange={set('ends_on')} required /></label>
        </div>
        <p className="note">Dollars off come off the whole booking. A discount never takes the total below the deposit.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row tight">
          <button className="btn btn-small">{editing ? 'Save changes' : 'Save special'}</button>
          {editing && <button type="button" className="btn btn-small btn-ghost" onClick={reset}>Cancel editing</button>}
        </div>
      </form>

      {rows?.length === 0 && <p>No specials yet.</p>}
      {rows?.map((sp) => (
        <article key={sp.id} className={`agenda special-row st-${sp.state}`}>
          <header><strong>{sp.title}</strong><span className="tag">{STATE[sp.state]}</span></header>
          <p>{sp.terms}, {niceDate(sp.starts_on)} to {niceDate(sp.ends_on)}</p>
          <p className="note">{services.filter((s) => sp.service_ids.includes(s.id)).map((s) => s.name).join(', ')}</p>
          {sp.description && <p>{sp.description}</p>}
          <p className="note">Used on {sp.used_count} booking{sp.used_count === 1 ? '' : 's'}</p>
          <div className="row tight">
            <button className="btn btn-small btn-ghost" onClick={() => edit(sp)}>Edit</button>
            <button className="btn btn-small btn-ghost" onClick={() => remove(sp)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  );
}
