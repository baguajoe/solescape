import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, duration, lengthLabel, money, PHONE, SMS } from '../api.js';
import { PriceLines, PriceTag } from '../components/Pricing.jsx';
import SlotPicker from '../components/SlotPicker.jsx';
import usePage from '../usePage.js';

const blank = { name: '', email: '', phone: '', address: '', notes: '', location_type: 'home' };

export default function Book({ config }) {
  usePage('Book an appointment', 'Pick a time on Kerimah\'s live calendar and hold it with a $75 deposit.');
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [slug, setSlug] = useState(params.get('service') || '');
  const [hours, setHours] = useState(3);
  const [addonIds, setAddonIds] = useState([]);
  const [quote, setQuote] = useState(null);
  const [start, setStart] = useState(null);
  const [form, setForm] = useState(blank);
  const [extra, setExtra] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [price, setPrice] = useState(null);

  useEffect(() => {
    api('/services').then(setCatalog).catch((e) => setError({ message: e.message }));
    const released = params.get('released');
    if (released) {
      api(`/bookings/${released}/release`, { method: 'POST' }).catch(() => {});
      setError({ message: 'Payment was cancelled, so that time was released. Choose a time to try again.' });
      params.delete('released');
      setParams(params, { replace: true });
    }
  }, []);

  const services = useMemo(() => catalog?.services.filter((s) => s.bookable) ?? [], [catalog]);
  const service = services.find((s) => s.slug === slug);
  const hourly = service?.pricing === 'hourly';
  const addons = catalog?.addons.filter((a) => a.service_id === service?.id || (service && a.service_id == null)) ?? [];
  const families = [];
  services.forEach((s) => {
    let f = families.find((x) => x.name === s.family);
    if (!f) families.push((f = { name: s.family, rows: [] }));
    f.rows.push(s);
  });

  function choose(s) {
    setSlug(s.slug); setAddonIds([]); setQuote(null); setConfirmed(false); setExtra(false);
    setHours(s.min_hours || 3); setError(null); setPrice(null);
  }

  // The server prices everything: regular price, any special or corporate discount, total and deposit
  const corporateOn = Boolean(config?.corporate) && service?.category === 'event';
  const usedCode = corporateOn ? code : '';
  useEffect(() => {
    if (!service) return undefined;
    let live = true;
    const q = new URLSearchParams({ service: service.slug, addons: addonIds.join(',') });
    if (hourly) q.set('hours', hours);
    if (start) q.set('start_at', start.start_at);
    if (usedCode) q.set('code', usedCode);
    api(`/quote?${q}`)
      .then((r) => { if (live) { setPrice(r); setCodeError(''); } })
      .catch((e) => {
        if (!live) return;
        if (e.field === 'corporate_code') { setCodeError(e.message); setCode(''); } else setPrice(null);
      });
    return () => { live = false; };
  }, [service?.slug, hours, addonIds.join(','), start?.start_at, usedCode]);

  function applyCode() {
    setCodeError('');
    if (error?.field === 'corporate_code') setError(null);
    setCode(codeInput.trim());
  }

  const query = service
    ? `service=${service.slug}&addons=${addonIds.join(',')}${hourly ? `&hours=${hours}` : ''}`
    : '';
  const set = (k) => (e) => { if (error?.field === k) setError(null); setForm({ ...form, [k]: e.target.value }); };
  const n = (step) => step + (addons.length || hourly ? 1 : 0);

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await api('/bookings', {
        method: 'POST',
        body: {
          ...form, service: service.slug, addon_ids: addonIds, hours: hourly ? hours : undefined,
          start_at: start.start_at, extra_therapists: extra, confirmed_requirement: confirmed, agreed_policy: agreed,
          corporate_code: usedCode || undefined,
        },
      });
      window.location.assign(r.checkout_url);
    } catch (err) {
      setError({ message: err.message, field: err.field || 'form' });
      if (err.field === 'start_at') setStart(null);
      setBusy(false);
    }
  }

  return (
    <div className="page book">
      <h1>Book an appointment</h1>
      <p className="lead">A {money(config?.deposit_cents ?? 7500)} deposit secures your date and time and goes toward your balance.</p>
      {error && !error.field && <p className="error" role="alert">{error.message}</p>}
      <div className="book-grid">
        <div>
          <section className="step">
            <h2><span className="step-n">1</span> Choose a service</h2>
            {!catalog && !error && <p>Loading services…</p>}
            {families.map((f) => (
              <fieldset key={f.name} className="choice-group">
                <legend>{f.name}</legend>
                {f.rows.map((s) => (
                  <label key={s.id} className={`choice ${slug === s.slug ? 'on' : ''}`}>
                    <input type="radio" name="service" checked={slug === s.slug} onChange={() => choose(s)} />
                    <span><b>{lengthLabel(s)}</b><small>{s.summary}</small></span>
                    <PriceTag s={s} className="choice-price" />
                  </label>
                ))}
              </fieldset>
            ))}
            {service?.note && <p className="note">{service.note}</p>}
          </section>

          {service && (hourly || addons.length > 0) && (
            <section className="step">
              <h2><span className="step-n">2</span> {hourly ? 'Size your event' : 'Add anything extra'}</h2>
              {hourly && (
                <div className="hours">
                  <span id="hours-label">Hours</span>
                  <button type="button" className="icon-btn" aria-label="Fewer hours" disabled={hours <= service.min_hours}
                    onClick={() => setHours(hours - 1)}>−</button>
                  <output aria-labelledby="hours-label" aria-live="polite">{hours}</output>
                  <button type="button" className="icon-btn" aria-label="More hours" disabled={hours >= service.max_hours}
                    onClick={() => setHours(hours + 1)}>+</button>
                  <span className="note">{service.min_hours}-hour minimum</span>
                </div>
              )}
              {addons.map((a) => (
                <label key={a.id} className={`choice ${addonIds.includes(a.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={addonIds.includes(a.id)}
                    onChange={() => setAddonIds(addonIds.includes(a.id) ? addonIds.filter((x) => x !== a.id) : [...addonIds, a.id])} />
                  <span><b>{a.name}</b><small>{a.summary}</small></span>
                  <span className="choice-price">{money(a.price_cents)}{a.per_hour ? '/hr' : ''}</span>
                </label>
              ))}
              {hourly && (
                <label className="check">
                  <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
                  <span>I'd like more than one therapist. Kerimah will confirm availability and pricing.</span>
                </label>
              )}
              {corporateOn && (
                <div className="corporate-code">
                  <label className="field" htmlFor="corporate-code"><span>Corporate code (optional)</span></label>
                  <div className="row tight">
                    <input id="corporate-code" value={codeInput} autoComplete="off" aria-invalid={Boolean(codeError)}
                      aria-describedby="corporate-code-help"
                      onChange={(e) => { setCodeInput(e.target.value); setCodeError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }} />
                    <button type="button" className="btn btn-small btn-ghost" disabled={!codeInput.trim()} onClick={applyCode}>Apply code</button>
                  </div>
                  <p id="corporate-code-help" className="note">
                    {codeError ? <span className="error-text" role="alert">{codeError}</span>
                      : price?.company_name ? <span role="status">Code applied for {price.company_name}.</span>
                        : config.corporate.description.split('\n')[0]}
                  </p>
                </div>
              )}
            </section>
          )}

          {service && (
            <section className="step">
              <h2><span className="step-n">{n(2)}</span> Pick a date and time</h2>
              <SlotPicker query={query} picked={start} onPick={setStart} onQuote={setQuote}
                onError={(e) => setError({ message: e.message })} />
              {error?.field === 'start_at' && <p className="error" role="alert">{error.message}</p>}
            </section>
          )}

          {start && (
            <form className="step" onSubmit={submit} noValidate>
              <h2><span className="step-n">{n(3)}</span> Your details</h2>
              <fieldset className="where">
                <legend>Where should Kerimah come?</legend>
                <label><input type="radio" name="where" checked={form.location_type === 'home'} onChange={() => setForm({ ...form, location_type: 'home' })} /> My home</label>
                <label><input type="radio" name="where" checked={form.location_type === 'workplace'} onChange={() => setForm({ ...form, location_type: 'workplace' })} /> My workplace or event venue</label>
              </fieldset>
              <Field label="Street address" name="address" form={form} set={set} error={error} autoComplete="street-address" />
              <Field label="Full name" name="name" form={form} set={set} error={error} autoComplete="name" />
              <div className="two">
                <Field label="Email" name="email" type="email" form={form} set={set} error={error} autoComplete="email" />
                <Field label="Mobile phone" name="phone" type="tel" form={form} set={set} error={error} autoComplete="tel" />
              </div>
              <label className="field">
                <span>Parking, access or anything else Kerimah should know (optional)</span>
                <textarea rows="3" value={form.notes} onChange={set('notes')} />
              </label>
              {service.confirm_text && (
                <label className="check">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>{service.confirm_text}</span>
                </label>
              )}
              <div className="policy-box">
                <h3>Reservation policies</h3>
                <ul>{(config?.policies ?? []).map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              <label className="check">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I agree to the reservation policies</span>
              </label>
              {error?.field && error.field !== 'start_at' && <p className="error" role="alert">{error.message}</p>}
              <button className="btn" disabled={busy}>{busy ? 'Holding your time…' : `Pay ${money(price?.deposit_cents ?? quote?.deposit_cents)} deposit`}</button>
            </form>
          )}
          <p className="note">Questions before you book? <a href={SMS}>Text {PHONE}</a>.</p>
        </div>

        <aside className="summary" aria-label="Your appointment">
          <h2>Your appointment</h2>
          {!service && <p>Choose a service to see your total.</p>}
          {service && (
            <>
              <p><b>{service.family}</b><br />{hourly ? `${hours} hours` : duration(service.duration_min)}</p>
              {addonIds.length > 0 && <p>+ {addons.filter((a) => addonIds.includes(a.id)).map((a) => a.name).join(', ')}</p>}
              {start && <p>{start.date_label}<br />{start.label}, arrival {start.arrival_label}</p>}
              {price && (
                <PriceLines regular={price.regular_cents} discount={price.discount_cents} label={price.discount_label}
                  total={price.total_cents} deposit={price.deposit_cents} due={price.total_cents - price.deposit_cents} />
              )}
              {extra && <p className="note">Extra therapists are quoted separately.</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, name, form, set, error, type = 'text', autoComplete }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={form[name]} onChange={set(name)} autoComplete={autoComplete} aria-invalid={error?.field === name} required />
    </label>
  );
}
