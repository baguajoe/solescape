import { Link } from 'react-router-dom';
import { money } from '../api.js';
import { WeeklyDealBanner } from '../components/Pricing.jsx';
import { slugOf, useCatalog } from '../components/Services.jsx';
import { lines, Paragraphs, useSiteText } from '../siteText.jsx';
import usePage from '../usePage.js';

export default function Home({ config }) {
  const { t } = useSiteText();
  usePage('', t('home.intro').replace(/\s+/g, ' '));
  const { families } = useCatalog();

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>{t('home.headline')}</h1>
          <Paragraphs className="hero-lead" text={t('home.intro')} />
          <p className="tagline">{t('home.tagline')}</p>
          <div className="row">
            <Link className="btn" to="/book">Book an appointment</Link>
            <Link className="btn btn-ghost" to="/services">See services and prices</Link>
          </div>
          <ul className="facts">
            {lines(t('home.facts')).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <figure className="pin">
          <div className="pin-ring">
            <img src="/images/chair-boston.jpg" alt="Kerimah's massage chair set up by a window high above Boston Common" width="1000" height="2223" fetchpriority="high" />
          </div>
        </figure>
      </section>

      {config?.weekly_deal && <div className="wrap"><WeeklyDealBanner deal={config.weekly_deal} /></div>}

      <section className="band band-sage" id="how">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="how">
            {t('home.steps').map((step, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i}><h3>{step.q}</h3><Paragraphs text={step.a} /></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section wrap">
        <div className="row between">
          <h2>Mobile services</h2>
          <Link className="text-link" to="/services">Full menu and policies</Link>
        </div>
        <div className="teasers">
          {families.map((f) => {
            const low = Math.min(...f.rows.map((s) => s.price_cents));
            const hourly = f.rows[0].pricing === 'hourly';
            return (
              <Link key={f.name} className="teaser" to={`/services#${slugOf(f.name)}`}>
                <h3>{f.name}</h3>
                <p className="keep-lines">{f.rows[0].summary}</p>
                <span className="price">{hourly ? `${money(low)}/hr` : `From ${money(low)}`}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="gallery" aria-label="Photos">
        <img className="g-office" src="/images/chair-massage-office.jpg" alt="A licensed massage therapist giving a chair massage in an office" width="1200" height="800" loading="lazy" />
        <img className="g-back" src="/images/back-massage.jpg" alt="Hands working the upper back during a massage" width="1200" height="799" loading="lazy" />
        <img className="g-foot" src="/images/foot-massage.jpg" alt="Foot reflexology with rolled towels and oils" width="1200" height="811" loading="lazy" />
        <img className="g-table" src="/images/table-outdoors.jpg" alt="A massage table set up on a lawn on a sunny day" width="747" height="1078" loading="lazy" />
      </section>

      <section className="band band-coffee">
        <div className="wrap about">
          <img className="portrait" src="/images/kerimah.jpg" alt="Kerimah, licensed massage therapist" width="278" height="302" loading="lazy" />
          <div>
            <h2>{t('about.heading')}</h2>
            <Paragraphs text={t('about.bio').split(/\n\s*\n/)[0]} />
            <Link className="btn btn-light" to="/about">Read her story</Link>
          </div>
        </div>
      </section>

      <section className="section wrap cta" id="closing">
        <h2>{t('home.cta_heading')}</h2>
        <Paragraphs text={t('home.cta_text')} />
        <div className="row center">
          <Link className="btn" to="/book">Book an appointment</Link>
          <Link className="btn btn-ghost" to="/contact">Ask a question</Link>
        </div>
      </section>
    </>
  );
}
