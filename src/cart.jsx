import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const Ctx = createContext(null);
const KEY = 'solescape-cart';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* cart still works for this visit */
    }
  }, [items]);

  const value = useMemo(() => ({
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((n, i) => n + i.qty * i.price_cents, 0),
    add: (p) => setItems((cur) => {
      const found = cur.find((i) => i.id === p.id);
      if (found) return cur.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...cur, { id: p.id, name: p.name, price_cents: p.price_cents, kind: p.kind, qty: 1 }];
    }),
    setQty: (id, qty) => setItems((cur) =>
      qty < 1 ? cur.filter((i) => i.id !== id) : cur.map((i) => (i.id === id ? { ...i, qty } : i))),
    clear: () => setItems([]),
  }), [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
