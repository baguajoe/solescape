import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useCart } from '../cart.jsx';

export function ProductRow({ p }) {
  const { add, items } = useCart();
  const inCart = items.find((i) => i.id === p.id)?.qty;
  return (
    <li className="service">
      <div><h3>{p.name}</h3><p>{p.summary}</p></div>
      <div className="service-buy">
        <strong>{money(p.price_cents)}</strong>
        <button className="btn btn-small" disabled={p.sold_out} onClick={() => add(p)}>
          {p.sold_out ? 'Sold out' : 'Add to cart'}
        </button>
        {inCart ? <Link to="/cart" className="in-cart">{inCart} in cart</Link> : null}
      </div>
    </li>
  );
}

export default function Shop() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/products').then((r) => setProducts(r.products)).catch((e) => setError(e.message)); }, []);
  const retail = products?.filter((p) => p.kind === 'retail') ?? [];

  return (
    <div className="page">
      <h1>Shop</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!products && !error && <p>Loading products…</p>}
      {products && (
        <>
          {retail.length === 0 && <p>New products are on the way.</p>}
          <ul className="services">{retail.map((p) => <ProductRow key={p.id} p={p} />)}</ul>
          <p className="note">Kerimah will text you to arrange pickup or bring your order to your next appointment.</p>
          <p>Want to support elders in the community? <Link to="/seniors">Sponsor Senior Foot Care</Link>.</p>
        </>
      )}
    </div>
  );
}
