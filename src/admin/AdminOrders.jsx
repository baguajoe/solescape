import { useCallback, useEffect, useState } from 'react';
import { api, money } from '../api.js';

export default function AdminOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/admin/orders').then((r) => setOrders(r.orders)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  async function act(path, opts) {
    setError('');
    try { await api(path, opts); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <h1>Orders</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {orders?.length === 0 && <p>Paid orders show up here.</p>}
      {orders?.map((o) => (
        <article className="agenda" key={o.id}>
          <header><strong>{o.created_label}</strong><span className="tag">{o.status}</span></header>
          <h4>{o.customer_name}, {money(o.total_cents)}</h4>
          <p>{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
          <p><a href={`sms:${o.customer_phone}`}>{o.customer_phone}</a>, <a href={`mailto:${o.customer_email}`}>{o.customer_email}</a></p>
          {o.notes && <p className="note">{o.notes}</p>}
          <div className="row tight">
            {o.status === 'paid' && <button className="btn btn-small" onClick={() => act(`/admin/orders/${o.id}`, { method: 'PATCH', body: { status: 'fulfilled' } })}>Mark fulfilled</button>}
            {['paid', 'fulfilled'].includes(o.status) && <button className="btn btn-small btn-ghost" onClick={() => act(`/admin/orders/${o.id}/refund`, { method: 'POST', body: {} })}>Refund</button>}
          </div>
        </article>
      ))}
    </div>
  );
}
