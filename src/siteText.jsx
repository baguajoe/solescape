import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import source from '../api/site_text.json';

/*
 * The website wording Kerimah edits on the admin's Site text page.
 * Pages show her latest text from /api/site-text. If that hasn't answered within WAIT_MS, they show the original
 * wording (the same file the API uses), then switch to hers when it arrives. The last answer is remembered in the
 * browser, so a returning visitor doesn't wait at all. It's always rendered as text, never as HTML.
 */
const WAIT_MS = 1200;
const CACHE_KEY = 'solescape-site-text';
const ORIGINAL = {};
source.pages.forEach((p) => p.blocks.forEach((b) => { ORIGINAL[b.key] = b.default; }));

function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY));
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

function writeCache(texts) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(texts)); } catch { /* private mode: no cache */ }
}

const SiteTextContext = createContext({ texts: null, ready: true, deposit: '$75' });

export function SiteTextProvider({ refresh, deposit, children }) {
  const [texts, setTexts] = useState(readCache);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { if (live) setTimedOut(true); }, WAIT_MS);
    api('/site-text')
      .then((r) => { if (live && r?.texts) { setTexts(r.texts); writeCache(r.texts); } })
      .catch(() => { if (live) setTimedOut(true); })
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); };
  }, [refresh]);

  return (
    <SiteTextContext.Provider value={{ texts, ready: Boolean(texts) || timedOut, deposit: deposit || '$75' }}>
      {children}
    </SiteTextContext.Provider>
  );
}

const sameShape = (a, b) => (Array.isArray(b) ? Array.isArray(a) : typeof a === 'string');

/** t('home.headline') returns her text, or the original. Questions and answers come back as [{ q, a }]. */
export function useSiteText() {
  const { texts, ready, deposit } = useContext(SiteTextContext);
  const t = (key) => {
    const mine = texts?.[key];
    if (mine != null && sameShape(mine, ORIGINAL[key])) return mine;
    const original = ORIGINAL[key] ?? '';
    const fill = (s) => s.replaceAll('{deposit}', deposit);
    return Array.isArray(original) ? original.map((p) => ({ q: p.q, a: fill(p.a) })) : fill(original);
  };
  return { t, ready };
}

/** A text block: an empty line starts a new paragraph, and single line breaks are kept. */
export function Paragraphs({ text, className = '' }) {
  return String(text || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <p key={i} className={`keep-lines ${className}`.trim()}>{p}</p>
  ));
}

/** A list block: one item per line. */
export const lines = (text) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
