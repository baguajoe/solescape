import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

      <form className="panel" onSubmit={save} aria-labelledby="deal-heading">
        <h2 id="deal-heading">Weekly Deals</h2>
        <p className="note">For 60-minute and 90-minute Sole Cleanse and Mama's Sole Relief sessions. Not the 120-minute session, Recovery Lounge or Foot Loose. The deal comes off automatically when the appointment day matches the area the client picks. The deposit stays the same.</p>
        <label className="check">
          <input type="checkbox" checked={s.weekly_deal_enabled === '1'} onChange={(e) => { setSaved(false); setS({ ...s, weekly_deal_enabled: e.target.checked ? '1' : '0' }); }} />
          <span>Turn on Weekly Deals</span>
        </label>
        <div className="two">
          <label className="field"><span>Dollars off</span><input inputMode="decimal" value={s.weekly_deal_dollars} onChange={set('weekly_deal_dollars')} /></label>
        </div>
        <div className="two">
          {[['weekly_deal_south_coast_day', 'South Coast day'], ['weekly_deal_boston_day', 'Boston area day']].map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span>
              <select value={s[k]} onChange={set(k)}>
                <option value="">No deal</option>
                {DAYS.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
              </select></label>
          ))}
        </div>
        <p className="note">Bookings keep the deal they got. If a client reschedules, the deal is worked out again for the new day, and they see the new total before they confirm.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-small">{saved ? 'Settings saved' : 'Save Weekly Deals'}</button>
      </form>

      <form className="panel" onSubmit={save} aria-labelledby="corp-heading">
        <h2 id="corp-heading">Corporate loyalty program</h2>
        <p className="note">For Recovery Lounge and Foot Loose. Companies and their codes are on the <Link to="/admin/corporate">Corporate clients</Link> page. Discounts never add together: the client gets whichever is larger.</p>
        <label className="check">
          <input type="checkbox" checked={s.corporate_enabled === '1'} onChange={(e) => { setSaved(false); setS({ ...s, corporate_enabled: e.target.checked ? '1' : '0' }); }} />
          <span>Turn on the corporate program</span>
        </label>
        <label className="field"><span>Program description (shown on the Services and booking pages)</span>
          <textarea rows="4" value={s.corporate_description} onChange={set('corporate_description')} /></label>
        {s.corporate_enabled === '1' && !s.corporate_description.trim() && <p className="note">The site won't mention the program, and codes won't work, until you write the description.</p>}
        <fieldset className="where">
          <legend>Reward</legend>
          <label><input type="radio" name="reward" checked={s.corporate_reward_type === 'percent'} onChange={() => setS({ ...s, corporate_reward_type: 'percent' })} /> A percent off every event</label>
          <label><input type="radio" name="reward" checked={s.corporate_reward_type === 'nth'} onChange={() => setS({ ...s, corporate_reward_type: 'nth' })} /> A reward after a number of completed events</label>
        </fieldset>
        {s.corporate_reward_type === 'percent' ? (
          <label className="field"><span>Percent off every event</span><input inputMode="decimal" value={s.corporate_percent} onChange={set('corporate_percent')} /></label>
        ) : (
          <>
            <div className="two">
              <label className="field"><span>Completed events needed</span><input inputMode="numeric" value={s.corporate_every_n} onChange={set('corporate_every_n')} /></label>
              <label className="field"><span>Then the next event gets</span>
                <select value={s.corporate_nth_reward} onChange={set('corporate_nth_reward')}>
                  <option value="percent">A percent off</option>
                  <option value="hours">Free hours</option>
                </select></label>
            </div>
            {s.corporate_nth_reward === 'percent'
              ? <label className="field"><span>Percent off the reward event</span><input inputMode="decimal" value={s.corporate_nth_percent} onChange={set('corporate_nth_percent')} /></label>
              : <label className="field"><span>Free hours on the reward event</span><input inputMode="numeric" value={s.corporate_nth_hours} onChange={set('corporate_nth_hours')} /></label>}
            <p className="note">Events count once you mark them completed on the Calendar. If a reward event is cancelled, the company gets the reward back.</p>
          </>
        )}
        <p className="note">The deposit stays the same, and a discount never takes the total below it.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-small">{saved ? 'Settings saved' : 'Save program'}</button>
      </form>
      <section className="panel">
        <h2>See appointments on your phone</h2>
        <p>Subscribe to this private link in Google Calendar or Apple Calendar. Don't share it, because it shows client names and phone numbers.</p>
        <input readOnly value={feed} aria-label="Private calendar link" onFocus={(e) => e.target.select()} />
      </section>
    </div>
  );
}
