import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function DemoPay() {
  const { kind, token } = useParams();
  const nav = useNavigate();
  const [error, setError] = useState('');

  async function pay() {
    try {
      await api(`/demo/pay/${kind}/${token}`, { method: 'POST' });
      nav(kind === 'booking' ? `/booking/${token}` : `/order/${token}`, { replace: true });
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="page narrow">
      <h1>Test payment</h1>
      <p>This stands in for the Stripe card page until Stripe keys are added. No card is charged.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" onClick={pay}>Complete test payment</button>
    </div>
  );
}
