import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const TOPIC = { question: 'Appointment question', event: 'Event inquiry', other: 'Other' };

export default function AdminMessages() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/admin/messages').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  async function mark(m, read) {
    try { await api(`/admin/messages/${m.id}`, { method: 'PATCH', body: { read } }); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <h1>Messages</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {data?.messages.length === 0 && <p>Messages from the Contact page show up here.</p>}
      {data?.messages.map((m) => (
        <article key={m.id} className={`agenda ${m.read ? 'st-cancelled' : ''}`}>
          <header><strong>{m.name}</strong><span className="tag">{m.read ? 'Read' : 'New'}</span></header>
          <p className="note">{m.created_label}, {TOPIC[m.topic]}</p>
          <p className="msg-body">{m.body}</p>
          <p><a href={`mailto:${m.email}`}>{m.email}</a>{m.phone && <>, <a href={`sms:${m.phone}`}>{m.phone}</a></>}</p>
          <button className="btn btn-small btn-ghost" onClick={() => mark(m, !m.read)}>{m.read ? 'Mark unread' : 'Mark read'}</button>
        </article>
      ))}
    </div>
  );
}
