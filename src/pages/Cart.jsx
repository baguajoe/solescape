import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useCart } from '../cart.jsx';

export default function Cart() {
  const { items, subtotal, setQty } = useCart();
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api('/orders', {
        method: 'POST',
        body: { ...form, items: items.map((i) => ({ product_id: i.id, qty: i.qty })) },
      });
      window.location.assign(r.checkout_url);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!items.length) {
    return <div className="page narrow"><h1>Your cart is empty</h1><p><Link className="btn" to="/shop">Go to the shop</Link></p></div>;
  }

  return (
    <div className="page narrow">
      <h1>Your cart</h1>
      <ul className="cart">
        {items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span>
            <span className="qty">
              <button type="button" className="icon-btn" aria-label={`Remove one ${i.name}`} onClick={() => setQty(i.id, i.qty - 1)}>−</button>
              <span aria-live="polite">{i.qty}</span>
              <button type="button" className="icon-btn" aria-label={`Add one ${i.name}`} onClick={() => setQty(i.id, i.qty + 1)}>+</button>
            </span>
            <span>{money(i.qty * i.price_cents)}</span>
          </li>
        ))}
        <li className="cart-total"><span>Subtotal</span><span>{money(subtotal)}</span></li>
      </ul>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Full name</span><input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
        <div className="two">
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
          <label className="field"><span>Mobile phone</span><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" required /></label>
        </div>
        <label className="field"><span>Order notes (optional)</span><textarea rows="2" value={form.notes} onChange={set('notes')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Starting checkout…' : 'Go to payment'}</button>
      </form>
    </div>
  );
}
