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

/** The menu price. */
export function PriceTag({ s, className = 'price' }) {
  return <span className={className}>{priceLabel(s)}</span>;
}

/** Her Weekly Deals text: her wording from the Site text page, or built from the Settings. Hidden while Weekly Deals are off. */
export function WeeklyDealBanner({ deal }) {
  if (!deal) return null;
  return (
    <aside className="deal-banner" aria-label="Weekly Deals">
      <p className="keep-lines"><strong>Weekly Deals:</strong> {deal.text}</p>
    </aside>
  );
}
