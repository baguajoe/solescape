import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const anchor = (key) => `text-${key.replace(/\./g, '-')}`;

/** "120 / 400 characters", red when over the limit. */
function Count({ value, max, id }) {
  const over = value.length > max;
  return (
    <small id={id} className={`count${over ? ' over' : ''}`} aria-live="polite">
      {value.length} / {max} characters{over ? `: ${value.length - max} too many` : ''}
    </small>
  );
}

function TextField({ block, value, onChange }) {
  const id = anchor(block.key);
  const rows = Math.min(14, Math.max(block.kind === 'list' ? 4 : 3, Math.ceil(value.length / 70) + value.split('\n').length));
  return (
    <label className="field">
      <span>{block.label}</span>
      {block.kind === 'line'
        ? <input value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-count`} />
        : <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-count`} />}
      <Count value={value} max={block.max} id={`${id}-count`} />
    </label>
  );
}

function PairsField({ block, value, onChange }) {
  const [first, second] = block.fields;
  const fixed = block.min_items === block.max_items;
  const set = (i, k, v) => onChange(value.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const move = (i, by) => {
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <div className="pairs">
      <p className="pairs-label">{block.label}</p>
      {value.map((p, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="pair" key={i}>
          <label className="field"><span>{first} {i + 1}</span>
            <input value={p.q} onChange={(e) => set(i, 'q', e.target.value)} /></label>
          <Count value={p.q} max={block.q_max} />
          <label className="field"><span>{second} {i + 1}</span>
            <textarea rows={Math.min(10, Math.max(3, Math.ceil(p.a.length / 50) + 1))} value={p.a} onChange={(e) => set(i, 'a', e.target.value)} /></label>
          <Count value={p.a} max={block.a_max} />
          {!fixed && (
            <div className="row tight">
              <button type="button" className="btn btn-small btn-ghost" disabled={i === 0} onClick={() => move(i, -1)}>Move up<span className="sr-only"> {first.toLowerCase()} {i + 1}</span></button>
              <button type="button" className="btn btn-small btn-ghost" disabled={i === value.length - 1} onClick={() => move(i, 1)}>Move down<span className="sr-only"> {first.toLowerCase()} {i + 1}</span></button>
              <button type="button" className="btn btn-small btn-ghost" disabled={value.length <= block.min_items} onClick={() => onChange(value.filter((_, j) => j !== i))}>Delete<span className="sr-only"> {first.toLowerCase()} {i + 1}</span></button>
            </div>
          )}
        </div>
      ))}
      {!fixed && value.length < block.max_items && (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange([...value, { q: '', a: '' }])}>Add a {first.toLowerCase()}</button>
      )}
    </div>
  );
}

function Original({ block }) {
  if (!block.edited) return null;
  const text = block.kind === 'pairs' ? block.original.map((p) => `${p.q}\n${p.a}`).join('\n\n') : block.original;
  return (
    <details className="original">
      <summary>See the original wording</summary>
      <p className="keep-lines">{text || '(empty)'}</p>
    </details>
  );
}

function TextBlock({ block, pageName, onUpdated }) {
  const [value, setValue] = useState(block.value);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(block.value); }, [block]);
  const dirty = !same(value, block.value);
  const change = (v) => { setValue(v); setStatus(''); setError(''); };

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setStatus('');
    try {
      const updated = await api(`/admin/site-text/${block.key}`, { method: 'PUT', body: { value } });
      onUpdated(updated);
      setStatus("Saved. It's on the live site now.");
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function reset() {
    setError(''); setStatus('');
    if (!block.edited) { setValue(block.value); return; }
    if (!window.confirm(`Go back to the original wording for "${block.label}" on the ${pageName} page? Your version will be replaced.`)) return;
    setBusy(true);
    try {
      const updated = await api(`/admin/site-text/${block.key}`, { method: 'DELETE' });
      onUpdated(updated);
      setStatus("Back to the original. It's on the live site now.");
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <form className="panel text-block" id={anchor(block.key)} onSubmit={save} aria-label={`${pageName}: ${block.label}`}>
      {block.kind === 'pairs'
        ? <PairsField block={block} value={value} onChange={change} />
        : <TextField block={block} value={value} onChange={change} />}
      {block.help && <p className="note">{block.help}</p>}
      <Original block={block} />
      {error && <p className="error" role="alert">{error}</p>}
      {status && <p className="success" role="status">{status}</p>}
      <div className="row tight text-actions">
        <button className="btn btn-small" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-small btn-ghost" disabled={busy || (!block.edited && !dirty)} onClick={reset}>Reset to original</button>
        <a className="text-link" href={block.view} target="_blank" rel="noreferrer">View the {pageName === 'Weekly Deals' ? 'Services' : pageName} page<span className="sr-only"> (opens a new tab)</span></a>
        {block.edited && !dirty && <small className="badge">Your wording</small>}
        {dirty && <small className="badge unsaved">Not saved yet</small>}
      </div>
    </form>
  );
}

export default function AdminSiteText() {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/site-text').then((r) => setPages(r.pages)).catch((e) => setError(e.message)); }, []);
  const onUpdated = useCallback((updated) => {
    setPages((all) => all.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.key === updated.key ? updated : b)) })));
  }, []);

  if (!pages) return error ? <p className="error" role="alert">{error}</p> : <p>Loading…</p>;
  return (
    <div className="site-text">
      <h1>Site text</h1>
      <p className="note">Change the wording on your website here. Type plain text: press Enter for a new line, and leave an empty line to start a new paragraph. Each box has its own Save button, and saving changes the live site right away. Reset to original puts back the wording the site started with.</p>
      <nav className="row tight jump" aria-label="Site text pages">
        {pages.map((p) => <a key={p.name} href={`#page-${p.name.toLowerCase().replace(/\s+/g, '-')}`}>{p.name}</a>)}
        <Link to="/admin/services">Service descriptions</Link>
      </nav>
      {pages.map((p) => {
        const id = `page-${p.name.toLowerCase().replace(/\s+/g, '-')}`;
        return (
          <section key={p.name} aria-labelledby={id}>
            <h2 id={id}>{p.name}</h2>
            {p.blocks.map((b) => <TextBlock key={b.key} block={b} pageName={p.name} onUpdated={onUpdated} />)}
          </section>
        );
      })}
      <p className="note">Service descriptions and notes are on the <Link to="/admin/services">Services and products</Link> page.</p>
    </div>
  );
}
