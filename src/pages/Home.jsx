import { Link } from 'react-router-dom';
import { money } from '../api.js';
import { WeeklyDealBanner } from '../components/Pricing.jsx';
import { slugOf, useCatalog } from '../components/Services.jsx';
import usePage from '../usePage.js';

export default function Home({ config }) {
  usePage('', 'SoleScape Foot Spa & Massage delivers mobile therapeutic foot care to restore movement, relieve chronic pain, and prevent injuries—right where you are.');
  const { families } = useCatalog();

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>A complete sole to soul recovery experience.</h1>
          <p className="hero-lead">SoleScape Foot Spa &amp; Massage delivers mobile therapeutic foot care to restore movement, relieve chronic pain, and prevent injuries—right where you are.</p>
          <p className="tagline">She travels to you</p>
          <div className="row">
            <Link className="btn" to="/book">Book an appointment</Link>
            <Link className="btn btn-ghost" to="/services">See services and prices</Link>
          </div>
          <ul className="facts">
            <li>All services are performed by your licensed massage therapist (LMT) at your home or workplace.</li>
            <li>All equipment is provided for your service.</li>
            <li>LMT arrives 30 minutes prior for setup.</li>
          </ul>
        </div>
        <figure className="pin">
          <div className="pin-ring">
            <img src="/images/chair-boston.jpg" alt="Kerimah's massage chair set up by a window high above Boston Common" width="1000" height="2223" fetchpriority="high" />
          </div>
        </figure>
      </section>

      {config?.weekly_deal && <div className="wrap"><WeeklyDealBanner deal={config.weekly_deal} /></div>}

      <section className="band band-sage">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="how">
            <li><h3>Book online</h3><p>Pick your service and an open time on her live calendar. A $75 deposit holds it and goes toward your total.</p></li>
            <li><h3>She comes to you</h3><p>Kerimah arrives 30 minutes early and brings all the equipment for your service.</p></li>
            <li><h3>Relax</h3><p>Enjoy your session, then pay the balance. Need to move it? Reschedule once online with 24 hours' notice.</p></li>
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
                <p>{f.rows[0].summary}</p>
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
            <h2>Hello! I'm Kerimah, your licensed massage therapist.</h2>
            <p>My learning experience into holistic health started in 2011, earning credentials from The Salter School &amp; The Costa Rica School of Massage Therapy. Licensed by the Commonwealth of Massachusetts, I am certified in reflexology and insured through Associated Bodywork &amp; Massage Professionals.</p>
            <Link className="btn btn-light" to="/about">Read her story</Link>
          </div>
        </div>
      </section>

      <section className="section wrap cta">
        <h2>Wellness that comes to you.</h2>
        <p>Mobile service at your home or workplace, from Boston to the South Coast.</p>
        <div className="row center">
          <Link className="btn" to="/book">Book an appointment</Link>
          <Link className="btn btn-ghost" to="/contact">Ask a question</Link>
        </div>
      </section>
    </>
  );
}
