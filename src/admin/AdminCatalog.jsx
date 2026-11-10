import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const dollars = (c) => (c == null ? '' : String(c / 100));
const cents = (v) => (v === '' ? null : Math.round(Number(v) * 100));

function ServiceEdit({ s, onSaved, setError }) {
  const hourly = s.pricing === 'hourly';
  const [f, setF] = useState({
    price: dollars(s.price_cents), length: (hourly ? s.min_hours : s.duration_min) ?? '',
    setup: s.setup_min ?? 30, deposit: dollars(s.deposit_cents), active: s.active,
  });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };
  async function save(e) {
    e.preventDefault(); setError('');
    const length = f.length === '' ? null : Number(f.length);
    try {
      await api(`/admin/services/${s.id}`, {
        method: 'PATCH',
        body: {
          price_cents: cents(f.price), [hourly ? 'min_hours' : 'duration_min']: length,
          setup_min: Number(f.setup || 0), deposit_cents: cents(f.deposit), active: f.active,
        },
      });
      setSaved(true); onSaved();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="cat-row" onSubmit={save}>
      <div className="cat-name"><b>{s.name}</b><small>{s.bookable ? 'Bookable online' : 'Needs a price and length to go online'}</small></div>
      <label className="field"><span>{hourly ? 'Price per hour ($)' : 'Price ($)'}</span><input inputMode="decimal" value={f.price} onChange={set('price')} /></label>
      <label className="field"><span>{hourly ? 'Minimum hours' : 'Minutes'}</span><input inputMode="numeric" value={f.length} onChange={set('length')} /></label>
      <label className="field"><span>Setup (min)</span><input inputMode="numeric" value={f.setup} onChange={set('setup')} /></label>
      <label className="field"><span>Deposit ($, blank = default)</span><input inputMode="decimal" value={f.deposit} onChange={set('deposit')} /></label>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /><span>Show</span></label>
      <button className="btn btn-small">{saved ? 'Saved' : 'Save'}</button>
    </form>
  );
}

function ProductEdit({ p, onSaved, setError }) {
  const [f, setF] = useState({ price: dollars(p.price_cents), stock: p.stock ?? '', active: p.active, taxable: p.taxable });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };
  async function save(e) {
    e.preventDefault(); setError('');
    try {
      await api(`/admin/products/${p.id}`, { method: 'PATCH', body: { price_cents: cents(f.price), stock: f.stock === '' ? null : Number(f.stock), active: f.active, taxable: f.taxable } });
      setSaved(true); onSaved();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="cat-row" onSubmit={save}>
      <div className="cat-name"><b>{p.name}</b><small>{p.kind === 'sponsorship' ? 'Sponsorship' : 'Product'}</small></div>
      <label className="field"><span>Price ($)</span><input inputMode="decimal" value={f.price} onChange={set('price')} /></label>
      <label className="field"><span>Stock (blank = not tracked)</span><input inputMode="numeric" value={f.stock} onChange={set('stock')} /></label>
      <label className="check"><input type="checkbox" checked={f.taxable} onChange={set('taxable')} /><span>Taxable</span></label>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /><span>Show</span></label>
      <button className="btn btn-small">{saved ? 'Saved' : 'Save'}</button>
    </form>
  );
}

function NewItem({ label, path, onDone, setError }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  async function add(e) {
    e.preventDefault(); setError('');
    try {
      await api(path, { method: 'POST', body: { name, price_cents: cents(price), active: true } });
      setName(''); setPrice(''); onDone();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="row tight new-item" onSubmit={add}>
      <label className="field"><span>{label} name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Price ($)</span><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <button className="btn btn-small btn-ghost">Add {label.toLowerCase()}</button>
    </form>
  );
}

export default function AdminCatalog() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/admin/catalog').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p>Loading…</p>;
  return (
    <div>
      <h1>Services and products</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <h2>Services</h2>
      {data.services.map((s) => <ServiceEdit key={s.id} s={s} onSaved={load} setError={setError} />)}
      <NewItem label="Service" path="/admin/services" onDone={load} setError={setError} />
      <h2>Products</h2>
      <p className="note">The Shop link appears on the site as soon as one product is showing.</p>
      {data.products.map((p) => <ProductEdit key={p.id} p={p} onSaved={load} setError={setError} />)}
      <NewItem label="Product" path="/admin/products" onDone={load} setError={setError} />
    </div>
  );
}
