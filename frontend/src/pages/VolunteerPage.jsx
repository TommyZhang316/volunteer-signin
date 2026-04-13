import { useState, useEffect } from 'react';

export default function VolunteerPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | locating | submitting | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => { setEvents(data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const reset = () => {
    setSelected(null);
    setName('');
    setPhase('idle');
    setMessage('');
  };

  const handleCheckin = () => {
    if (!name.trim()) {
      setPhase('error');
      setMessage('Please enter your name.');
      return;
    }

    if (!navigator.geolocation) {
      setPhase('error');
      setMessage('Geolocation is not supported by your browser.');
      return;
    }

    setPhase('locating');
    setMessage('Getting your location…');

    navigator.geolocation.getCurrentPosition(
      async pos => {
        setPhase('submitting');
        setMessage('Checking in…');
        try {
          const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id: selected.id,
              volunteer_name: name.trim(),
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            setPhase('success');
          } else {
            setPhase('error');
            setMessage(data.error || 'Check-in failed. Please try again.');
          }
        } catch {
          setPhase('error');
          setMessage('Network error. Please try again.');
        }
      },
      err => {
        setPhase('error');
        if (err.code === 1) {
          setMessage('Location access was denied. Please allow location access and try again.');
        } else if (err.code === 3) {
          setMessage('Location request timed out. Please try again.');
        } else {
          setMessage('Could not get your location. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <div className="page">
        <div className="success-screen">
          <div className="success-circle">✓</div>
          <h2>Checked In!</h2>
          <p className="volunteer-name">{name}</p>
          <p className="event-name">{selected.name}</p>
          <button className="btn btn-primary" onClick={reset}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Event list ──────────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Volunteer Sign-In</h1>
          <p>Select your event to check in</p>
        </div>

        {loading && <div className="spinner">Loading events…</div>}

        {!loading && events.length === 0 && (
          <div className="empty">No active events right now.</div>
        )}

        {events.map(ev => (
          <div
            key={ev.id}
            className="card card-clickable"
            onClick={() => { setSelected(ev); setPhase('idle'); setMessage(''); }}
          >
            <h3>{ev.name}</h3>
            <p className="meta">{ev.venue_name}</p>
            <p className="meta">{new Date(ev.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>
        ))}
      </div>
    );
  }

  // ── Check-in form ───────────────────────────────────────────────────────────
  const busy = phase === 'locating' || phase === 'submitting';

  return (
    <div className="page">
      <button className="btn btn-ghost" onClick={reset} style={{ marginBottom: 16 }}>
        ← Back to events
      </button>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>{selected.name}</h3>
        <p className="meta">{selected.venue_name}</p>
        <p className="meta">
          {new Date(selected.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      </div>

      {phase === 'error' && <div className="msg msg-error">{message}</div>}
      {busy && <div className="msg msg-info">{message}</div>}

      <div className="form-group">
        <label htmlFor="vol-name">Your Name</label>
        <input
          id="vol-name"
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); if (phase === 'error') setPhase('idle'); }}
          placeholder="Enter your full name"
          disabled={busy}
          autoComplete="name"
        />
      </div>

      <button
        className="btn btn-success"
        onClick={handleCheckin}
        disabled={busy}
      >
        {phase === 'locating' ? '📡 Getting location…' :
         phase === 'submitting' ? '⏳ Checking in…' :
         '✓ Check In'}
      </button>

      <p className="location-note">
        📍 Your location will be verified — you must be within 100 m of the venue
      </p>
    </div>
  );
}
