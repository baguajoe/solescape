import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';

const blank = { name: '', contact_name: '', email: '', phone: '', notes: '', code: '' };
const STATUS = { held: 'Awaiting payment', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show', payment_conflict: 'Needs attention' };

function Progress({ c, program }) {
  if (program.reward_type !== 'nth') return <p>{program.terms} every event</p>;
  const p = c.progress;
  if (p.available > 0) return <p className="tag-warn">Reward ready: their next event gets {program.terms}</p>;
  return (
    <div>
      <p>{p.toward_next} of {p.every_n} completed events toward the next reward ({program.terms})</p>
      <progress max={p.every_n} value={p.toward_next} aria-label="Progress toward the next reward" />
    </div>
  );
}

function Company({ c, program, reload, setError }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(c);
  const [editing, setEditing] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(body) {
    setError('');
    try { await api(`/admin/companies/${c.id}`, { method: 'PATCH', body }); setEditing(false); reload(); } catch (err) { setError(err.message); }
  }
  return (
    <article className={`agenda company ${c.active ? '' : 'st-cancelled'}`}>
      <header>
        <strong>{c.name}</strong>
        <span className="tag code" aria-label={`Corporate code ${c.code}`}>{c.code}</span>
      </header>
      <p>{[c.contact_name, c.phone, c.email].filter(Boolean).join(', ')}</p>
      {c.notes && <p className="note">{c.notes}</p>}
      <p>{c.booking_count} event{c.booking_count === 1 ? '' : 's'} booked, {c.upcoming_count} upcoming. Total spent on completed events: {money(c.spent_cents)}</p>
      <Progress c={c} program={program} />
      <div className="row tight">
        <button className="btn btn-small btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} booking history</button>
        <button className="btn btn-small btn-ghost" onClick={() => setEditing(!editing)}>Edit</button>
        <button className="btn btn-small btn-ghost" onClick={() => save({ active: !c.active })}>{c.active ? 'Turn off code' : 'Turn code back on'}</button>
      </div>
      {editing && (
        <form className="panel" onSubmit={(e) => { e.preventDefault(); save(f); }}>
          <CompanyFields f={f} set={set} />
          <button className="btn btn-small">Save company</button>
        </form>
      )}
      {open && (c.bookings.length === 0 ? <p className="note">No bookings yet.</p> : (
        <table className="history">
          <thead><tr><th>Date</th><th>Service</th><th>Status</th><th>Total</th><th>Discount</th></tr></thead>
          <tbody>
            {c.bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.date_label}</td>
                <td>{b.service_name}{b.hours ? `, ${b.hours} hrs` : ''}</td>
                <td>{STATUS[b.status]}</td>
                <td>{money(b.total_cents)}</td>
                <td>{b.discount_cents ? `${b.discount_label}: −${money(b.discount_cents)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </article>
  );
}

function CompanyFields({ f, set }) {
  return (
    <>
      <div className="two">
        <label className="field"><span>Company name</span><input value={f.name} onChange={set('name')} required /></label>
        <label className="field"><span>Contact name</span><input value={f.contact_name} onChange={set('contact_name')} /></label>
      </div>
      <div className="two">
        <label className="field"><span>Contact email</span><input type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span>Contact phone</span><input type="tel" value={f.phone} onChange={set('phone')} /></label>
      </div>
      <label className="field"><span>Notes (only you see these)</span><textarea rows="2" value={f.notes} onChange={set('notes')} /></label>
      <label className="field"><span>Corporate code (leave blank to make one up)</span><input value={f.code} onChange={set('code')} autoComplete="off" /></label>
    </>
  );
}

export default function AdminCorporate() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const load = useCallback(() => { api('/admin/companies').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault(); setError(''); setAdded('');
    try {
      const c = await api('/admin/companies', { method: 'POST', body: form });
      setAdded(`${c.name} added. Their corporate code is ${c.code}.`); setForm(blank); load();
    } catch (err) { setError(err.message); }
  }

  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p>Loading…</p>;
  const { program } = data;
  return (
    <div>
      <h1>Corporate clients</h1>
      <p>Companies enter their code when they book Recovery Lounge or Foot Loose. The booking is linked to the company, and the reward is applied automatically.</p>
      {program.live
        ? <p className="success">The program is on: {program.reward_type === 'nth' ? `after every ${program.every_n} completed events, the next one gets ${program.terms}` : `${program.terms} every event`}. <Link to="/admin/settings">Change it in Settings</Link>.</p>
        : <p className="note">The program is off, so codes don't work yet and the site doesn't mention it. Turn it on and write the description in <Link to="/admin/settings">Settings</Link>.</p>}
      {added && <p className="success" role="status">{added}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <form className="panel" onSubmit={add} noValidate>
        <h2>Add a company</h2>
        <CompanyFields f={form} set={set} />
        <button className="btn btn-small">Add company</button>
      </form>
      {data.companies.length === 0 && <p>No companies yet.</p>}
      {data.companies.map((c) => <Company key={`${c.id}-${c.code}-${c.active}`} c={c} program={program} reload={load} setError={setError} />)}
    </div>
  );
}
