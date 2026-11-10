const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const dayKey = (d) => `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;

export function buildGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const cells = Array((first.getDay() + 6) % 7).fill(null);
  const total = new Date(y, m, 0).getDate();
  for (let d = 1; d <= total; d += 1) cells.push(new Date(y, m - 1, d));
  return cells;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function monthTitle(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function MonthNav({ month, onChange, canGoBack = true }) {
  return (
    <div className="month-nav">
      <button type="button" className="icon-btn" aria-label="Previous month" disabled={!canGoBack}
        onClick={() => onChange(shiftMonth(month, -1))}>‹</button>
      <h3 aria-live="polite">{monthTitle(month)}</h3>
      <button type="button" className="icon-btn" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>›</button>
    </div>
  );
}

export function WeekHeader() {
  return WEEK.map((d) => <div key={d} className="cal-head" aria-hidden="true">{d}</div>);
}
