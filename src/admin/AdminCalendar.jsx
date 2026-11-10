import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { buildGrid, dayKey, monthKey, MonthNav, WeekHeader } from '../components/Calendar.jsx';

const STATUS = { held: 'Awaiting payment', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show', payment_conflict: 'Needs attention' };
const today = dayKey(new Date());

function BookingCard({ b, reload, setError }) {
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState('');
  async function act(fn) {
    setError('');
    try { await fn(); reload(); } catch (e) { setError(e.message); }
  }
  const patch = (body) => act(() => api(`/admin/bookings/${b.id}`, { method: 'PATCH', body }));
  const left = b.deposit_paid_cents - b.refunded_cents;
  return (
    <article className={`agenda st-${b.status}`}>
      <header><strong>{b.time_label} to {b.end_time_label}<small className="arrive">Arrive {b.arrival_label} to set up</small></strong><span className="tag">{STATUS[b.status]}</span></header>
      <h4>{b.service_name}{b.hours ? `, ${b.hours} hrs` : ''}{b.addons.length ? ` + ${b.addons.map((a) => a.name).join(', ')}` : ''}</h4>
      <p>{b.customer_name}, <a href={`sms:${b.customer_phone}`}>{b.customer_phone}</a>{b.customer_email && <>, <a href={`mailto:${b.customer_email}`}>{b.customer_email}</a></>}</p>
      {b.address && <p>{b.location_type === 'workplace' ? 'Workplace' : 'Home'}: {b.address}</p>}
      {b.extra_therapists && <p className="tag-warn">Asked for additional therapists</p>}
      {b.reschedule_count > 0 && <p className="note">Rescheduled by the client</p>}
      {b.cancelled_by === 'client' && <p className="note">Cancelled by the client. Deposit kept.</p>}
      {b.notes && <p className="note">{b.notes}</p>}
      <p>Total {money(b.total_cents)}, deposit {money(b.deposit_paid_cents)}
        {b.refunded_cents > 0 && `, refunded ${money(b.refunded_cents)}`}
        {b.balance_paid ? ', balance paid' : `, ${money(b.balance_cents)} due`}</p>
      <div className="row tight">
        {['confirmed', 'payment_conflict'].includes(b.status) && !b.balance_paid &&
          <button className="btn btn-small" onClick={() => patch({ balance_paid: true })}>Mark balance paid</button>}
        {b.status === 'confirmed' && <button className="btn btn-small btn-ghost" onClick={() => patch({ status: 'completed' })}>Mark completed</button>}
        {b.status !== 'cancelled' && <button className="btn btn-small btn-ghost" onClick={() => setMoving(!moving)}>Reschedule</button>}
        {b.status === 'confirmed' && <button className="btn btn-small btn-ghost" onClick={() => patch({ status: 'no_show' })}>No-show</button>}
        {b.status !== 'cancelled' && <button className="btn btn-small btn-ghost" onClick={() => patch({ status: 'cancelled' })}>Cancel</button>}
        {left > 0 && <button className="btn btn-small btn-ghost" onClick={() => act(() => api(`/admin/bookings/${b.id}/refund`, { method: 'POST', body: {} }))}>Refund {money(left)}</button>}
      </div>
      {moving && (
        <div className="row tight move">
          <label className="field"><span>New date and time</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <button className="btn btn-small" disabled={!when} onClick={() => patch({ start_local: when })}>Move appointment</button>
        </div>
      )}
    </article>
  );
}

function NewBooking({ date, services, onDone, setError }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', service_id: '', time: '11:00', deposit: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      await api('/admin/bookings', {
        method: 'POST',
        body: { ...f, service_id: Number(f.service_id), start_local: `${date}T${f.time}`, deposit_paid_cents: Math.round(Number(f.deposit || 0) * 100) },
      });
      onDone();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h3>Add a phone or text booking</h3>
      <label className="field"><span>Service</span>
        <select value={f.service_id} onChange={set('service_id')} required>
          <option value="">Choose…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
      <div className="two">
        <label className="field"><span>Client name</span><input value={f.name} onChange={set('name')} required /></label>
        <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} /></label>
      </div>
      <div className="two">
        <label className="field"><span>Time</span><input type="time" value={f.time} onChange={set('time')} required /></label>
        <label className="field"><span>Deposit already collected ($)</span><input inputMode="decimal" value={f.deposit} onChange={set('deposit')} /></label>
      </div>
      <label className="field"><span>Address</span><input value={f.address} onChange={set('address')} /></label>
      <button className="btn btn-small">Add booking</button>
    </form>
  );
}

export default function AdminCalendar() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(today);
  const [services, setServices] = useState([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/calendar?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);
  useEffect(load, [load]);
  useEffect(() => { api('/admin/catalog').then((r) => setServices(r.services)).catch(() => {}); }, []);

  const byDay = {};
  data?.bookings.forEach((b) => { (byDay[b.local_date] ||= []).push(b); });
  const off = new Set(data?.time_off.flatMap((t) => t.local_dates));
  const dayRows = byDay[selected] || [];
  const attention = data?.bookings.filter((b) => b.status === 'payment_conflict') ?? [];

  return (
    <div>
      <h1>Calendar</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {attention.length > 0 && <p className="error" role="alert">{attention.length} paid booking{attention.length > 1 ? 's' : ''} collided with another appointment this month. Rebook or refund them.</p>}
      <div className="admin-cal">
        <div>
          <MonthNav month={month} onChange={setMonth} />
          <div className="cal cal-big">
            <WeekHeader />
            {buildGrid(month).map((d, i) => {
              if (!d) return <div key={`x${i}`} />;
              const key = dayKey(d);
              const rows = (byDay[key] || []).filter((b) => b.status !== 'cancelled');
              return (
                <button type="button" key={key} className={`cal-day ${selected === key ? 'on' : ''} ${key === today ? 'today' : ''} ${off.has(key) ? 'off' : ''}`}
                  aria-pressed={selected === key} onClick={() => { setSelected(key); setAdding(false); }}>
                  <span>{d.getDate()}</span>
                  {rows.length > 0 && <small>{rows.length} appt{rows.length > 1 ? 's' : ''}</small>}
                </button>
              );
            })}
          </div>
        </div>
        <section aria-label="Selected day">
          <div className="row between">
            <h2>{new Date(`${selected}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
            <button className="btn btn-small" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add booking'}</button>
          </div>
          {adding && <NewBooking date={selected} services={services} setError={setError} onDone={() => { setAdding(false); load(); }} />}
          {dayRows.length === 0 && !adding && <p>No appointments on this day.</p>}
          {dayRows.map((b) => <BookingCard key={b.id} b={b} reload={load} setError={setError} />)}
        </section>
      </div>
    </div>
  );
}
