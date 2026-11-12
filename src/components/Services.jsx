import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, lengthLabel } from '../api.js';
import { PriceTag } from './Pricing.jsx';

export function useCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/services').then(setCatalog).catch((e) => setError(e.message)); }, []);
  const families = [];
  catalog?.services.forEach((s) => {
    let f = families.find((x) => x.name === s.family);
    if (!f) families.push((f = { name: s.family, category: s.category, note: s.note, rows: [] }));
    f.rows.push(s);
  });
  return { catalog, error, families };
}

export const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function Family({ name, rows, note, extra }) {
  return (
    <article className="family" id={slugOf(name)}>
      <h3>{name}</h3>
      <ul>
        {rows.map((s) => (
          <li key={s.id}>
            <div className="len">
              <b>{lengthLabel(s)}</b>
              <PriceTag s={s} />
            </div>
            <p>{s.summary}</p>
            <Link className="btn btn-small" to={`/book?service=${s.slug}`}>Book {s.pricing === 'hourly' ? name : lengthLabel(s)}</Link>
          </li>
        ))}
      </ul>
      {(note || extra) && <p className="note family-extra">{[note, extra].filter(Boolean).join(' ')}</p>}
    </article>
  );
}
