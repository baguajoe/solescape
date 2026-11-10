import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AdminSchedule() {
  const [hours, setHours] = useState(null);
  const [off, setOff] = useState([]);
  const [block, setBlock] = useState({ start_local: '', end_local: '', reason: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api('/admin/schedule').then((r) => { setHours(r.hours); setOff(r.time_off); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const edit = (weekday, patch) => { setSaved(false); setHours(hours.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h))); };

  async function save(e) {
    e.preventDefault(); setError('');
    try { await api('/admin/hours', { method: 'PUT', body: { hours } }); setSaved(true); } catch (err) { setError(err.message); }
  }
  async function addOff(e) {
    e.preventDefault(); setError('');
    try {
      await api('/admin/time-off', { method: 'POST', body: block });
      setBlock({ start_local: '', end_local: '', reason: '' }); load();
    } catch (err) { setError(err.message); }
  }
  async function removeOff(id) {
    try { await api(`/admin/time-off/${id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  }

  if (!hours) return error ? <p className="error" role="alert">{error}</p> : <p>Loading…</p>;
  return (
    <div>
      <h1>Hours and time off</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="panel" onSubmit={save}>
        <h2>Weekly hours</h2>
        {hours.map((h) => {
          const open = Boolean(h.opens);
          return (
            <div className="hours-row" key={h.weekday}>
              <label className="check"><input type="checkbox" checked={open}
                onChange={(e) => edit(h.weekday, e.target.checked ? { opens: '10:00', closes: '18:00' } : { opens: null, closes: null })} /><span>{DAYS[h.weekday]}</span></label>
              {open ? (
                <>
                  <input type="time" aria-label={`${DAYS[h.weekday]} opens`} value={h.opens} onChange={(e) => edit(h.weekday, { opens: e.target.value })} />
                  <input type="time" aria-label={`${DAYS[h.weekday]} closes`} value={h.closes} onChange={(e) => edit(h.weekday, { closes: e.target.value })} />
                </>
              ) : <span className="note">Closed</span>}
            </div>
          );
        })}
        <button className="btn btn-small">{saved ? 'Hours saved' : 'Save hours'}</button>
      </form>
      <form className="panel" onSubmit={addOff}>
        <h2>Block off time</h2>
        <div className="two">
          <label className="field"><span>From</span><input type="datetime-local" value={block.start_local} onChange={(e) => setBlock({ ...block, start_local: e.target.value })} /></label>
          <label className="field"><span>To</span><input type="datetime-local" value={block.end_local} onChange={(e) => setBlock({ ...block, end_local: e.target.value })} /></label>
        </div>
        <label className="field"><span>Reason (only you see this)</span><input value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} /></label>
        <button className="btn btn-small">Block this time</button>
        {off.length > 0 && <ul className="plain">
          {off.map((t) => <li key={t.id}><span>{t.label}{t.reason ? ` (${t.reason})` : ''}</span> <button type="button" className="linkish" onClick={() => removeOff(t.id)}>Remove</button></li>)}
        </ul>}
      </form>
    </div>
  );
}
