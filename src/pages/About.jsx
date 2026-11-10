import { Link } from 'react-router-dom';
import usePage from '../usePage.js';

const CREDENTIALS = [
  'Licensed by the Commonwealth of Massachusetts',
  'Certified in reflexology',
  'Insured through Associated Bodywork & Massage Professionals',
  'The Salter School',
  'The Costa Rica School of Massage Therapy',
  'Studying holistic health since 2011',
];

export default function About() {
  usePage('About Kerimah', 'Kerimah is a licensed massage therapist certified in reflexology, trained at The Salter School and The Costa Rica School of Massage Therapy.');
  return (
    <>
      <section className="page about-page">
        <div className="about-head">
          <img className="portrait" src="/images/kerimah.jpg" alt="Kerimah, licensed massage therapist" width="278" height="302" />
          <div>
            <h1>Hello! I'm Kerimah, your licensed massage therapist.</h1>
          </div>
        </div>
        <div className="about-body">
          <div className="prose">
            <p>My learning experience into holistic health started in 2011, earning credentials from The Salter School &amp; The Costa Rica School of Massage Therapy. Licensed by the Commonwealth of Massachusetts, I am certified in reflexology and insured through Associated Bodywork &amp; Massage Professionals.</p>
            <p>My great-grandfather was a massage therapist in Panama, and I am grateful to continue his journey through his talents. As an earth sign, my healing element is water. I enjoy good food, creative writing, sunrises, and swimming.</p>
            <Link className="btn" to="/book">Book with Kerimah</Link>
          </div>
          <aside className="creds">
            <h2>About your LMT</h2>
            <ul>{CREDENTIALS.map((c) => <li key={c}>{c}</li>)}</ul>
          </aside>
        </div>
      </section>
      <section className="band band-sage">
        <div className="wrap split-photos">
          <figure>
            <img src="/images/table-outdoors.jpg" alt="Kerimah's massage table set up outdoors" loading="lazy" />
          </figure>
          <div>
            <h2>Why mobile</h2>
            <p>SoleScape brings the spa to you. Kerimah carries every piece of equipment, sets up 30 minutes before your session, and works wherever you're most comfortable: your living room, your office or your event space.</p>
            <p>That means no driving after a massage, and more time to rest.</p>
            <Link className="btn btn-ghost" to="/services">See services</Link>
          </div>
        </div>
      </section>
    </>
  );
}
