import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useCart } from '../cart.jsx';

export default function OrderDone() {
  const { token } = useParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const { clear } = useCart();

  useEffect(() => { api(`/orders/${token}`).then(setO).catch((e) => setError(e.message)); }, [token, tries]);
  useEffect(() => { if (o && o.status !== 'pending') clear(); }, [o?.status]);
  useEffect(() => {
    if (o?.status === 'pending' && tries < 15) {
      const t = setTimeout(() => setTries((n) => n + 1), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [o, tries]);

  if (error) return <div className="page narrow"><p className="error" role="alert">{error}</p></div>;
  if (!o) return <div className="page narrow"><p>Loading your order…</p></div>;

  return (
    <div className="page narrow">
      <h1>{o.status === 'pending' ? 'Confirming your payment…' : `Thank you, ${o.customer_name.split(' ')[0]}`}</h1>
      <div className="receipt">
        {o.items.map((i) => <p key={i.name}>{i.qty} × {i.name}</p>)}
        <dl>
          <div><dt>Subtotal</dt><dd>{money(o.subtotal_cents)}</dd></div>
          {o.tax_cents > 0 && <div><dt>Sales tax</dt><dd>{money(o.tax_cents)}</dd></div>}
          <div><dt>Total</dt><dd>{money(o.total_cents)}</dd></div>
        </dl>
      </div>
      <p>Kerimah will text you if anything needs arranging.</p>
    </div>
  );
}
