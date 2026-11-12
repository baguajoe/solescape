import { money, priceLabel } from '../api.js';

/** Regular price, the discount and the new total on separate lines, then the deposit and balance. */
export function PriceLines({ regular, discount, label, total, deposit, depositLabel = 'Deposit today', due, dueLabel = 'Due at appointment' }) {
  return (
    <dl className="price-lines">
      {discount > 0 && (
        <>
          <div><dt>Regular price</dt><dd>{money(regular)}</dd></div>
          <div className="discount"><dt>{label}</dt><dd>−{money(discount)}</dd></div>
        </>
      )}
      <div className="total"><dt>Total</dt><dd>{money(total)}</dd></div>
      {deposit != null && <div><dt>{depositLabel}</dt><dd>{money(deposit)}</dd></div>}
      {due != null && <div><dt>{dueLabel}</dt><dd>{money(due)}</dd></div>}
    </dl>
  );
}

/** The menu price, with the sale price next to it while a special covers this service. */
export function PriceTag({ s, className = 'price' }) {
  if (!s.sale) return <span className={className}>{priceLabel(s)}</span>;
  const per = s.pricing === 'hourly' ? '/hr' : '';
  if (s.sale.price_cents == null) {
    return <span className={className}>{priceLabel(s)} <span className="sale-note">{s.sale.terms}</span></span>;
  }
  return (
    <span className={className}>
      <s aria-label={`Regular price ${priceLabel(s)}`}>{priceLabel(s)}</s>{' '}
      <span className="sale" aria-label={`Special price ${money(s.sale.price_cents)}${per}`}>{money(s.sale.price_cents)}{per}</span>
    </span>
  );
}

export function SpecialBanner({ special }) {
  if (!special) return null;
  const when = special.date_basis === 'appointment'
    ? `For appointments ${special.starts_label} to ${special.ends_label}.`
    : `Book by ${special.ends_label}.`;
  return (
    <aside className="special-banner" aria-label="Special">
      <h2>{special.title}</h2>
      {special.description && <p>{special.description}</p>}
      <p className="note">{special.terms}. {when}</p>
    </aside>
  );
}
