import { Link } from 'react-router-dom';
import { lines, Paragraphs, useSiteText } from '../siteText.jsx';
import usePage from '../usePage.js';


export default function About() {
  const { t } = useSiteText();
  usePage('About Kerimah', 'Kerimah is a licensed massage therapist certified in reflexology, trained at The Salter School and The Costa Rica School of Massage Therapy.');
  return (
    <>
      <section className="page about-page">
        <div className="about-head">
          <img className="portrait" src="/images/kerimah.jpg" alt="Kerimah, licensed massage therapist" width="278" height="302" />
          <div>
            <h1>{t('about.heading')}</h1>
          </div>
        </div>
        <div className="about-body">
          <div className="prose">
            <Paragraphs text={t('about.bio')} />
            <Link className="btn" to="/book">Book with Kerimah</Link>
          </div>
          <aside className="creds">
            <h2>About your LMT</h2>
            <ul>{lines(t('about.credentials')).map((c) => <li key={c}>{c}</li>)}</ul>
          </aside>
        </div>
      </section>
      <section className="band band-sage" id="why-mobile">
        <div className="wrap split-photos">
          <figure>
            <img src="/images/table-outdoors.jpg" alt="Kerimah's massage table set up outdoors" loading="lazy" />
          </figure>
          <div>
            <h2>{t('about.why_heading')}</h2>
            <Paragraphs text={t('about.why_text')} />
            <Link className="btn btn-ghost" to="/services">See services</Link>
          </div>
        </div>
      </section>
    </>
  );
}
