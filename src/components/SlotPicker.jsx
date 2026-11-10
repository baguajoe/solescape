import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { buildGrid, dayKey, monthKey, MonthNav, WeekHeader } from './Calendar.jsx';

/** Month calendar of open days, then the open times for the chosen day.
 *  query: "service=...&hours=...&addons=..." for a new booking, or "booking=TOKEN" to reschedule. */
export default function SlotPicker({ query, picked, onPick, onQuote, onError }) {
  const thisMonth = monthKey(new Date());
  const [month, setMonth] = useState(thisMonth);
  const [days, setDays] = useState(null);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState(null);

  useEffect(() => { setDate(''); setSlots(null); onPick(null); }, [query]);

  useEffect(() => {
    let live = true;
    setDays(null);
    api(`/availability?${query}&month=${month}`)
      .then((r) => { if (!live) return; setDays(r.days); onQuote?.(r); })
      .catch((e) => live && onError?.(e));
    return () => { live = false; };
  }, [query, month]);

  async function pickDay(key) {
    setDate(key); setSlots(null); onPick(null);
    try { setSlots(await api(`/availability/day?${query}&date=${key}`)); } catch (e) { onError?.(e); }
  }

  const none = days && !Object.values(days).some(Boolean);
  return (
    <div className="picker">
      <MonthNav month={month} onChange={setMonth} canGoBack={month > thisMonth} />
      <div className="cal" role="group" aria-label="Available dates">
        <WeekHeader />
        {buildGrid(month).map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const key = dayKey(d);
          const open = (days?.[key] ?? 0) > 0;
          return (
            <button type="button" key={key} disabled={!open} aria-pressed={date === key}
              aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${open ? '' : ', unavailable'}`}
              className={`cal-day ${date === key ? 'on' : ''}`} onClick={() => pickDay(key)}>{d.getDate()}</button>
          );
        })}
      </div>
      {!days && <p className="note">Checking the calendar…</p>}
      {none && <p className="note">No open times this month. Try the next month.</p>}
      {date && !slots && <p className="note">Loading times…</p>}
      {slots && (
        <>
          <h3 className="slot-title">{slots.date_label}</h3>
          {slots.slots.length === 0 && <p className="note">No times left on this day.</p>}
          <div className="slots">
            {slots.slots.map((s) => (
              <button type="button" key={s.start_at} aria-pressed={picked?.start_at === s.start_at}
                className={`slot ${picked?.start_at === s.start_at ? 'on' : ''}`}
                onClick={() => onPick({ ...s, date_label: slots.date_label })}>{s.label}</button>
            ))}
          </div>
          {picked && <p className="note">Kerimah arrives at {picked.arrival_label} to set up.</p>}
        </>
      )}
    </div>
  );
}
