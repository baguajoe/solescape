import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api, INSTAGRAM, money, PHONE, SMS } from './api.js';
import { useCart } from './cart.jsx';
import { SiteTextProvider, useSiteText } from './siteText.jsx';
import Home from './pages/Home.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import Book from './pages/Book.jsx';
import BookingDone from './pages/BookingDone.jsx';
import Shop from './pages/Shop.jsx';
import Cart from './pages/Cart.jsx';
import OrderDone from './pages/OrderDone.jsx';
import DemoPay from './pages/DemoPay.jsx';
import Admin from './admin/Admin.jsx';

function Header({ open, setOpen, shopOpen }) {
  const { count } = useCart();
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <img src="/images/logo-small.png" alt="" width="52" height="52" />
        <span>SoleScape<small>Foot Spa &amp; Massage</small></span>
      </Link>
      <button className="menu-btn" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>Menu</button>
      <nav id="main-nav" className={open ? 'open' : ''}>
        <NavLink end to="/">Home</NavLink>
        <NavLink to="/services">Services</NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/contact">Contact</NavLink>
        {shopOpen && <NavLink to="/shop">Shop</NavLink>}
        {count > 0 && <NavLink to="/cart">Cart ({count})</NavLink>}
        <Link to="/book" className="btn btn-light btn-small">Book now</Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="foot-brand">
        <img src="/images/logo.png" alt="SoleScape Foot Spa & Massage logo" width="120" height="120" loading="lazy" />
        <p>Wellness that comes to you.</p>
      </div>
      <nav aria-label="Footer">
        <h2>Pages</h2>
        <p><Link to="/services">Services and prices</Link></p>
        <p><Link to="/about">About Kerimah</Link></p>
        <p><Link to="/services#policies">Reservation policies</Link></p>
        <p><Link to="/book">Book an appointment</Link></p>
      </nav>
      <div>
        <h2>Contact</h2>
        <p>Text or call <a href={SMS}>{PHONE}</a></p>
        <p><a href="mailto:solescapefootspa@gmail.com">solescapefootspa@gmail.com</a></p>
        <p><a href={INSTAGRAM}>Instagram @_solescapefootspa</a></p>
      </div>
      <div>
        <h2>Mobile service</h2>
        <p>At your home or workplace, Boston to the South Coast.</p>
        <p>Licensed by the Commonwealth of Massachusetts, insured through ABMP.</p>
      </div>
      <p className="foot-legal">© {new Date().getFullYear()} SoleScape Foot Spa &amp; Massage. <Link to="/admin">Owner sign in</Link></p>
    </footer>
  );
}

// Pages with text she edits on the Site text page. They wait briefly for her latest text (see siteText.jsx).
const TEXT_PAGES = ['/', '/services', '/about', '/contact'];

function Main({ children }) {
  const { ready } = useSiteText();
  const { pathname, hash } = useLocation();
  const waiting = !ready && TEXT_PAGES.includes(pathname);
  useEffect(() => {
    if (hash && ready) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [pathname, hash, ready]);
  return <main id="main" className={waiting ? 'text-wait' : undefined} aria-busy={waiting || undefined}>{children}</main>;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  const hideBar = ['/book', '/booking', '/demo-pay', '/cart', '/order'].some((p) => pathname.startsWith(p));

  useEffect(() => { api('/config').then(setConfig).catch(() => {}); }, [pathname === '/admin']);
  useEffect(() => { setOpen(false); }, [pathname, hash]);
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname]);

  return (
    <SiteTextProvider refresh={isAdmin} deposit={config && money(config.deposit_cents)}>
      <a className="skip" href="#main">Skip to content</a>
      {config?.payment_mode === 'demo' && <div className="demo-bar">Demo mode: no real payments are taken.</div>}
      {!isAdmin && <Header open={open} setOpen={setOpen} shopOpen={config?.shop_open} />}
      <Main>
        <Routes>
          <Route path="/" element={<Home config={config} />} />
          <Route path="/services" element={<ServicesPage config={config} />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact config={config} />} />
          <Route path="/book" element={<Book config={config} />} />
          <Route path="/booking/:token" element={<BookingDone config={config} />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order/:token" element={<OrderDone />} />
          <Route path="/demo-pay/:kind/:token" element={<DemoPay />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<div className="page narrow"><h1>That page isn't here</h1><p><Link to="/">Go to the home page</Link></p></div>} />
        </Routes>
      </Main>
      {!isAdmin && !hideBar && <Link className="book-bar" to="/book">Book an appointment</Link>}
      {!isAdmin && <Footer />}
    </SiteTextProvider>
  );
}
