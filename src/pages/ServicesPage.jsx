import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { money, PHONE, SMS } from '../api.js';
import { SpecialBanner } from '../components/Pricing.jsx';
import { Family, useCatalog } from '../components/Services.jsx';
import usePage from '../usePage.js';

export default function ServicesPage({ config }) {
  usePage('Services and prices', 'Sole Cleanse and Mama\'s Sole Relief mobile massages from $190, plus Recovery Lounge chair massage and Foot Loose foot massage for events at $190 an hour.');
  const { catalog, error, families } = useCatalog();
  const { hash } = useLocation();
  useEffect(() => { if (hash && catalog) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [hash, catalog]);

  const massage = families.filter((f) => f.category !== 'event');
  const events = families.filter((f) => f.category === 'event');
  const soaks = catalog?.addons.find((a) => a.name === 'Foot soaks');
  const deposit = money(config?.deposit_cents ?? 7500);
  const faqs = [
    ['Where do you come?', 'To your home or workplace, from Boston to the South Coast of Massachusetts.'],
    ['Do I need my own table or supplies?', 'No. All equipment is provided for your service.'],
    ['When does Kerimah arrive?', 'Thirty minutes before your start time, to set up.'],
    ['How does the deposit work?', `Every reservation needs a ${deposit} deposit to hold your date and time. It's applied to your balance and is non-refundable.`],
    ['Can I change my appointment?', 'Yes, once, with at least 24 hours\' notice. Use the link in your confirmation email to pick a new time, and your deposit moves with it. Same-day cancellations forfeit the deposit.'],
    ['Can I book a massage while pregnant?', "Mama's Sole Relief is designed for clients in their 2nd and 3rd trimester."],
    ['How do events work?', 'Recovery Lounge and Foot Loose are booked by the hour with a 3-hour minimum. Additional licensed massage therapists are available on request.'],
  ];

  return (
    <div className="page">
      <h1>Services and prices</h1>
      <p className="lead">A sole to soul lasting experience. All services are performed by your licensed massage therapist (LMT) at your home or workplace. All equipment is provided for your service.</p>
      <SpecialBanner special={config?.special} />
      {error && <p className="error" role="alert">{error}</p>}
      {!catalog && !error && <p>Loading services…</p>}

      <section>
        <h2>Mobile services</h2>
        <div className="families two-up">{massage.map((f) => <Family key={f.name} {...f} />)}</div>
      </section>

      <section className="band-inset" id="events">
        <h2>Events</h2>
        <p>Convenient for corporate events, community events, and special events.</p>
        <div className="families two-up">{events.map((f) => <Family key={f.name} {...f} extra={f.name === 'Foot Loose' && soaks ? `Add foot soaks ${money(soaks.price_cents)}/hr.` : ''} />)}</div>
        {config?.corporate && (
          <div className="corporate-note">
            <h3>Corporate clients</h3>
            {config.corporate.description.split('\n').filter((x) => x.trim()).map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
      </section>

      <section className="policies" id="policies">
        <div>
          <h2>Reservation policies</h2>
          <p className="note">You'll agree to these when you book.</p>
        </div>
        <ul className="policy-list">{(config?.policies ?? []).map((p) => <li key={p}>{p}</li>)}</ul>
      </section>

      <section id="faq">
        <h2>Questions</h2>
        <div className="faq">
          {faqs.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
        <p>Something else? <a href={SMS}>Text {PHONE}</a> or <Link to="/contact">send a message</Link>.</p>
      </section>
    </div>
  );
}
