import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, INSTAGRAM, PHONE, SMS } from '../api.js';
import usePage from '../usePage.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fmt = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const blank = { name: '', email: '', phone: '', topic: 'question', message: '', website: '' };

export default function Contact({ config }) {
  usePage('Contact', 'Text or call 617.297.8564, email solescapefootspa@gmail.com, or send SoleScape a message about appointments and events.');
  const [form, setForm] = useState(blank);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { if (error?.field === k) setError(null); setForm({ ...form, [k]: e.target.value }); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/messages', { method: 'POST', body: form });
      setSent(true); setForm(blank);
    } catch (err) { setError({ message: err.message, field: err.field }); }
    setBusy(false);
  }

  return (
    <div className="page contact">
      <h1>Contact</h1>
      <p className="lead">The fastest way to reach Kerimah is a text. Ready to book? <Link to="/book">Pick a time online</Link>.</p>
      <div className="contact-grid">
        <div>
          <ul className="ways">
            <li><span>Text or call</span><a href={SMS}>{PHONE}</a></li>
            <li><span>Email</span><a href="mailto:solescapefootspa@gmail.com">solescapefootspa@gmail.com</a></li>
            <li><span>Instagram</span><a href={INSTAGRAM}>@_solescapefootspa</a></li>
            <li><span>Service area</span>Your home or workplace, Boston to the South Coast</li>
          </ul>
          {config?.hours && (
            <>
              <h2>Appointment hours</h2>
              <dl className="hours-list">
                {config.hours.map((h) => (
                  <div key={h.weekday}><dt>{DAYS[h.weekday]}</dt><dd>{h.opens ? `${fmt(h.opens)} to ${fmt(h.closes)}` : 'Closed'}</dd></div>
                ))}
              </dl>
            </>
          )}
        </div>
        <form className="panel" onSubmit={submit} noValidate>
          <h2>Send a message</h2>
          {sent && <p className="success" role="status">Thanks. Your message was sent, and Kerimah will get back to you soon.</p>}
          <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={error?.field === 'name'} required /></label>
          <div className="two">
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={error?.field === 'email'} required /></label>
            <label className="field"><span>Phone (optional)</span><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></label>
          </div>
          <label className="field"><span>What's it about?</span>
            <select value={form.topic} onChange={set('topic')}>
              <option value="question">A question about an appointment</option>
              <option value="event">An event or workplace booking</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="field"><span>Message</span><textarea rows="5" value={form.message} onChange={set('message')} aria-invalid={error?.field === 'message'} required /></label>
          <label className="hp" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={set('website')} /></label>
          {error && <p className="error" role="alert">{error.message}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
        </form>
      </div>
    </div>
  );
}
