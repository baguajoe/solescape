import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, PHONE, SMS } from '../api.js';
import { PriceLines } from '../components/Pricing.jsx';
import SlotPicker from '../components/SlotPicker.jsx';
import usePage from '../usePage.js';

export default function BookingDone({ config }) {
  usePage('Your appointment');
  const { token } = useParams();
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [mode, setMode] = useState('');
  const [pick, setPick] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/bookings/${token}`).then(setB).catch((e) => setError(e.status === 404 ? 'That appointment could not be found.' : e.message));
  }, [token, tries]);

  // Stripe confirms by webhook, which can land a few seconds after the redirect
  useEffect(() => {
    if (b?.status === 'held' && tries < 15) {
      const t = setTimeout(() => setTries((x) => x + 1), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [b, tries]);

  async function act(path, body, done) {
    setBusy(true); setError('');
    try {
      setB(await api(`/bookings/${token}/${path}`, { method: 'POST', body }));
      setMode(''); setPick(null); setNotice(done);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (!b) return <div className="page narrow">{error ? <p className="error" role="alert">{error}</p> : <p>Loading your appointment…</p>}</div>;

  const first = b.customer_name.split(' ')[0];
  const title = {
    confirmed: `You're booked, ${first}`,
    held: 'Confirming your deposit…',
    completed: 'Thanks for your visit',
    cancelled: 'This appointment is cancelled',
    no_show: 'This appointment was missed',
    payment_conflict: 'Kerimah will contact you',
  }[b.status];

  return (
    <div className="page narrow">
      <h1>{title}</h1>
      {notice && <p className="success" role="status">{notice}</p>}
      {b.status === 'payment_conflict' && (
        <p className="error" role="alert">Your deposit came through, but that time was taken while you were paying. Kerimah will text you to rebook.</p>
      )}
      {b.status === 'held' && tries >= 15 && (
        <p>This is taking longer than usual. If you paid, you'll get an email soon. Questions? <a href={SMS}>Text {PHONE}</a>.</p>
      )}
      <div className="receipt">
        <p><b>{b.service_name}</b>{b.hours ? `, ${b.hours} hours` : ''}</p>
        {b.addons.map((a) => <p key={a.name}>+ {a.name}</p>)}
        <p>{b.date_label}<br />{b.time_label} to {b.end_time_label}</p>
        <p>Kerimah arrives at {b.arrival_label} to set up at {b.address}.</p>
        <PriceLines regular={b.regular_cents} discount={b.discount_cents} label={b.discount_label} total={b.total_cents}
          deposit={b.deposit_paid_cents} depositLabel="Deposit paid" due={b.balance_cents} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {b.status === 'confirmed' && !mode && (
        <div className="row">
          <a className="btn" href={`/api/bookings/${token}/calendar.ics`}>Add to my calendar</a>
          {b.can_reschedule && <button className="btn btn-ghost" onClick={() => setMode('move')}>Reschedule</button>}
          {b.can_cancel && <button className="btn btn-ghost" onClick={() => setMode('cancel')}>Cancel appointment</button>}
        </div>
      )}
      {b.status === 'confirmed' && !b.can_reschedule && (
        <p className="note">
          {b.reschedule_count > 0 ? 'This appointment has used its one deposit transfer.' : `Online rescheduling closes ${b.notice_hours} hours before your appointment.`}
          {' '}To make changes, <a href={SMS}>text {PHONE}</a>.
        </p>
      )}

      {mode === 'move' && (
        <section className="panel">
          <h2>Choose a new time</h2>
          <p>Your deposit transfers to the new time. You can do this once.</p>
          <SlotPicker query={`booking=${token}`} picked={pick} onPick={setPick} onError={(e) => setError(e.message)} />
          <div className="row">
            <button className="btn" disabled={!pick || busy}
              onClick={() => act('reschedule', { start_at: pick.start_at }, 'Your appointment has been moved. A confirmation is on its way.')}>
              {pick ? `Move to ${pick.label}` : 'Choose a time'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setMode(''); setPick(null); }}>Keep my current time</button>
          </div>
        </section>
      )}
      {mode === 'cancel' && (
        <section className="panel">
          <h2>Cancel this appointment?</h2>
          <p>Your {money(b.deposit_paid_cents)} deposit is non-refundable.{b.can_reschedule ? ' You can reschedule instead and keep your deposit.' : ''}</p>
          <div className="row">
            <button className="btn btn-danger" disabled={busy} onClick={() => act('cancel', undefined, 'Your appointment is cancelled.')}>Cancel appointment</button>
            <button className="btn btn-ghost" onClick={() => setMode('')}>Keep my appointment</button>
          </div>
        </section>
      )}
      <p><Link to="/">Back to SoleScape</Link></p>
    </div>
  );
}
