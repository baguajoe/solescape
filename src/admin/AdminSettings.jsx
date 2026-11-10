import { useEffect, useState } from 'react';
import { api } from '../api.js';

const FIELDS = [
  ['deposit_dollars', 'Deposit per reservation ($)'],
  ['buffer_min', 'Travel time between appointments (minutes)'],
  ['lead_hours', 'Minimum notice for online booking (hours)'],
  ['notice_hours', 'Notice needed to reschedule online (hours)'],
  ['horizon_days', 'How far ahead clients can book (days)'],
  ['slot_step_min', 'Start times every (minutes)'],
  ['tax_percent', 'Sales tax on taxable products (percent)'],
];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [feed, setFeed] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/admin/settings').then((r) => { setS(r.settings); setFeed(r.calendar_feed); }).catch((e) => setError(e.message));
  }, []);
  const set = (k) => (e) => { setSaved(false); setS({ ...s, [k]: e.target.value }); };

  async function save(e) {
    e.preventDefault(); setError('');
    try { await api('/admin/settings', { method: 'PUT', body: s }); setSaved(true); } catch (err) { setError(err.message); }
  }

  if (!s) return error ? <p className="error" role="alert">{error}</p> : <p>Loading…</p>;
  return (
    <div>
      <h1>Settings</h1>
      <form className="panel" onSubmit={save}>
        <div className="two">
          {FIELDS.map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span><input inputMode="decimal" value={s[k]} onChange={set(k)} /></label>
          ))}
        </div>
        <label className="field"><span>Reservation policies (one per line)</span><textarea rows="7" value={s.policies} onChange={set('policies')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-small">{saved ? 'Settings saved' : 'Save settings'}</button>
      </form>
      <section className="panel">
        <h2>See appointments on your phone</h2>
        <p>Subscribe to this private link in Google Calendar or Apple Calendar. Don't share it, because it shows client names and phone numbers.</p>
        <input readOnly value={feed} aria-label="Private calendar link" onFocus={(e) => e.target.select()} />
      </section>
    </div>
  );
}
