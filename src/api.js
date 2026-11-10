export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('The site could not be reached. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Try again.', res.status, data.field);
  return data;
}

export const money = (cents) =>
  cents == null ? '' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

export function duration(min) {
  if (!min) return '';
  if (min < 120 || min % 60) return `${min} minutes`;
  return `${min / 60} hours`;
}

export function priceLabel(s) {
  return s.pricing === 'hourly' ? `${money(s.price_cents)}/hr` : money(s.price_cents);
}

export function lengthLabel(s) {
  return s.pricing === 'hourly' ? `${s.min_hours}-hour minimum` : `${s.duration_min} minutes`;
}

export const PHONE = '617.297.8564';
export const SMS = 'sms:+16172978564';
export const INSTAGRAM = 'https://www.instagram.com/_solescapefootspa/';
