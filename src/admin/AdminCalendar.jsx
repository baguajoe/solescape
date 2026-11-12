import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { buildGrid, dayKey, monthKey, MonthNav, WeekHeader } from '../components/Calendar.jsx';

const STATUS = { held: 'Awaiting payment', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show', payment_conflict: 'Needs attention' };
const today = dayKey(new Date());
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const nextDay = (key) => { const d = new Date(`${key}T12:00`); d.setDate(d.getDate() + 1); return dayKey(d); };
const weekdayOf = (key) => (new Date(`${key}T12:00`).getDay() + 6) % 7; // 0 = Monday, like the server

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
      <p className="area-line">Area: {b.area_label || 'not given'}{b.weekly_deal_applied && <span className="tag deal-chip">Weekly Deal</span>}</p>
      {b.extra_therapists && <p className="tag-warn">Asked for additional therapists</p>}
      {b.reschedule_count > 0 && <p className="note">Rescheduled by the client</p>}
      {b.cancelled_by === 'client' && <p className="note">Cancelled by the client. Deposit kept.</p>}
      {b.notes && <p className="note">{b.notes}</p>}
      {b.company_name && <p>Company: {b.company_name}</p>}
      {b.discount_cents > 0 && <p className="note">Regular {money(b.regular_cents)}, {b.discount_label} −{money(b.discount_cents)}</p>}
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

function NewBooking({ date, services, companies, onDone, setError }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', area: '', service_id: '', time: '11:00', deposit: '', company_id: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      await api('/admin/bookings', {
        method: 'POST',
        body: { ...f, service_id: Number(f.service_id), start_local: `${date}T${f.time}`, deposit_paid_cents: Math.round(Number(f.deposit || 0) * 100), company_id: f.company_id ? Number(f.company_id) : undefined },
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
      <div className="two">
        <label className="field"><span>Address</span><input value={f.address} onChange={set('address')} /></label>
        <label className="field"><span>Area</span>
          <select value={f.area} onChange={set('area')}>
            <option value="">Not given</option>
            <option value="boston">Boston area</option>
            <option value="south_coast">South Coast</option>
            <option value="other">Other</option>
          </select></label>
      </div>
      {companies.length > 0 && (
        <label className="field"><span>Corporate client (optional)</span>
          <select value={f.company_id} onChange={set('company_id')}>
            <option value="">None</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      )}
      <button className="btn btn-small">Add booking</button>
    </form>
  );
}

function BlockTime({ date, onDone, setError }) {
  const [f, setF] = useState({ start: '13:00', end: '15:00', reason: '', weekly: false, until: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      const r = f.weekly
        ? await api('/admin/recurring-blocks', { method: 'POST', body: { weekday: weekdayOf(date), start_time: f.start, end_time: f.end, reason: f.reason, starts_on: date, ends_on: f.until || undefined } })
        : await api('/admin/time-off', { method: 'POST', body: { start_local: `${date}T${f.start}`, end_local: `${date}T${f.end}`, reason: f.reason } });
      onDone(r.overlaps);
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h3>Block part of this day</h3>
      <div className="two">
        <label className="field"><span>From</span><input type="time" value={f.start} onChange={set('start')} required /></label>
        <label className="field"><span>To</span><input type="time" value={f.end} onChange={set('end')} required /></label>
      </div>
      <label className="field"><span>Reason (optional, only you see this)</span><input value={f.reason} onChange={set('reason')} /></label>
      <label className="check"><input type="checkbox" checked={f.weekly} onChange={set('weekly')} /><span>Repeat every {WEEKDAYS[weekdayOf(date)]}</span></label>
      {f.weekly && <label className="field"><span>Until (optional, leave blank to keep repeating)</span><input type="date" value={f.until} min={date} onChange={set('until')} /></label>}
      <button className="btn btn-small">{f.weekly ? `Block every ${WEEKDAYS[weekdayOf(date)]}` : 'Block this time'}</button>
    </form>
  );
}

function OverlapWarning({ rows, onClose, onPick }) {
  if (!rows?.length) return null;
  return (
    <div className="warn-box" role="alert">
      <p><b>Blocked, but this overlaps {rows.length} confirmed appointment{rows.length > 1 ? 's' : ''}.</b> {rows.length > 1 ? "They weren't" : "It wasn't"} cancelled. Reschedule or cancel {rows.length > 1 ? 'them' : 'it'} if you need to.</p>
      <ul>{rows.map((o) => <li key={o.id}><button type="button" className="linkish" onClick={() => onPick(o.local_date)}>{o.label}</button></li>)}</ul>
      <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>OK</button>
    </div>
  );
}

export default function AdminCalendar() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(today);
  const [services, setServices] = useState([]);
  const [adding, setAdding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [overlaps, setOverlaps] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/calendar?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);
  useEffect(load, [load]);
  useEffect(() => { api('/admin/catalog').then((r) => setServices(r.services)).catch(() => {}); }, []);
  useEffect(() => { api('/admin/companies').then((r) => setCompanies(r.companies.filter((c) => c.active))).catch(() => {}); }, []);

  const blocked = (rows) => { setBlocking(false); setOverlaps(rows); load(); };
  async function blockDay() {
    setError('');
    try {
      const r = await api('/admin/time-off', { method: 'POST', body: { start_local: `${selected}T00:00`, end_local: `${nextDay(selected)}T00:00` } });
      blocked(r.overlaps);
    } catch (e) { setError(e.message); }
  }
  async function unblock(b) {
    const what = b.kind === 'weekly' ? `the weekly block (${b.span})` : `this block (${b.span})`;
    if (!window.confirm(`Remove ${what}?`)) return;
    setError('');
    try {
      await api(b.kind === 'weekly' ? `/admin/recurring-blocks/${b.id}` : `/admin/time-off/${b.id}`, { method: 'DELETE' });
      load();
    } catch (e) { setError(e.message); }
  }

  const byDay = {};
  data?.bookings.forEach((b) => { (byDay[b.local_date] ||= []).push(b); });
  const blocksByDay = {};
  data?.blocks.forEach((b) => { (blocksByDay[b.local_date] ||= []).push(b); });
  const dayRows = byDay[selected] || [];
  const dayBlocks = blocksByDay[selected] || [];
  const wholeDay = dayBlocks.some((b) => b.whole_day);
  const pick = (key) => { setSelected(key); setAdding(false); setBlocking(false); };
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
              const bl = blocksByDay[key] || [];
              const full = bl.some((b) => b.whole_day);
              const blockText = full ? 'Blocked' : bl.length ? 'Part blocked' : '';
              return (
                <button type="button" key={key} className={`cal-day ${selected === key ? 'on' : ''} ${key === today ? 'today' : ''} ${full ? 'off' : ''} ${bl.length && !full ? 'part-off' : ''}`}
                  aria-pressed={selected === key} onClick={() => pick(key)}
                  aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${rows.length ? `, ${rows.length} appointment${rows.length > 1 ? 's' : ''}` : ''}${blockText ? `, ${blockText.toLowerCase()}` : ''}`}>
                  <span>{d.getDate()}</span>
                  {rows.length > 0 && <small>{rows.length} appt{rows.length > 1 ? 's' : ''}</small>}
                  {blockText && <small className="blocked-label">{blockText}</small>}
                </button>
              );
            })}
          </div>
        </div>
        <section aria-label="Selected day">
          <div className="row between">
            <h2>{new Date(`${selected}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
            <button className="btn btn-small" onClick={() => { setAdding(!adding); setBlocking(false); }}>{adding ? 'Close' : 'Add booking'}</button>
          </div>
          <div className="row tight">
            {!wholeDay && <button className="btn btn-small btn-ghost" onClick={blockDay}>Block this day</button>}
            <button className="btn btn-small btn-ghost" aria-expanded={blocking} onClick={() => { setBlocking(!blocking); setAdding(false); }}>{blocking ? 'Close' : 'Block part of this day'}</button>
          </div>
          <OverlapWarning rows={overlaps} onClose={() => setOverlaps(null)} onPick={(key) => { setMonth(key.slice(0, 7)); pick(key); }} />
          {blocking && <BlockTime date={selected} setError={setError} onDone={blocked} />}
          {dayBlocks.length > 0 && (
            <ul className="blocks" aria-label="Blocked time">
              {dayBlocks.map((b) => (
                <li key={`${b.kind}-${b.id}`} className="block-row">
                  <span><b>Blocked {b.whole_day ? 'all day' : b.label}</b>{b.kind === 'weekly' && <small> (every {WEEKDAYS[weekdayOf(selected)]})</small>}{b.reason && <small>: {b.reason}</small>}</span>
                  <button type="button" className="linkish" onClick={() => unblock(b)}>{b.kind === 'weekly' ? 'Remove weekly block' : 'Remove block'}</button>
                </li>
              ))}
            </ul>
          )}
          {adding && <NewBooking date={selected} services={services} companies={companies} setError={setError} onDone={() => { setAdding(false); load(); }} />}
          {dayRows.length === 0 && !adding && <p>No appointments on this day.</p>}
          {dayRows.map((b) => <BookingCard key={b.id} b={b} reload={load} setError={setError} />)}
        </section>
      </div>
    </div>
  );
}
