import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { money, PHONE, SMS } from '../api.js';
import { WeeklyDealBanner } from '../components/Pricing.jsx';
import { Family, useCatalog } from '../components/Services.jsx';
import { Paragraphs, useSiteText } from '../siteText.jsx';
import usePage from '../usePage.js';

export default function ServicesPage({ config }) {
  usePage('Services and prices', 'Sole Cleanse and Mama\'s Sole Relief mobile massages from $190, plus Recovery Lounge chair massage and Foot Loose foot massage for events at $190 an hour.');
  const { catalog, error, families } = useCatalog();
  const { t } = useSiteText();
  const { hash } = useLocation();
  useEffect(() => { if (hash && catalog) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [hash, catalog]);

  const massage = families.filter((f) => f.category !== 'event');
  const events = families.filter((f) => f.category === 'event');
  const soaks = catalog?.addons.find((a) => a.name === 'Foot soaks');
  const faqs = t('services.faq');

  return (
    <div className="page">
      <h1>Services and prices</h1>
      <Paragraphs className="lead" text={t('services.intro')} />
      <WeeklyDealBanner deal={config?.weekly_deal} />
      {error && <p className="error" role="alert">{error}</p>}
      {!catalog && !error && <p>Loading services…</p>}

      <section>
        <h2>Mobile services</h2>
        <div className="families two-up">{massage.map((f) => <Family key={f.name} {...f} />)}</div>
      </section>

      <section className="band-inset" id="events">
        <h2>Events</h2>
        <Paragraphs text={t('services.events_intro')} />
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
          {faqs.map(({ q, a }, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <details key={i}><summary>{q}</summary><Paragraphs text={a} /></details>
          ))}
        </div>
        <p>Something else? <a href={SMS}>Text {PHONE}</a> or <Link to="/contact">send a message</Link>.</p>
      </section>
    </div>
  );
}
