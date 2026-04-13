import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const STORAGE_KEY = 'volunteerAdminPw';

export default function AdminPage() {
  const [password, setPassword] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState('events'); // 'events' | 'create'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type, text }

  const [attendanceEvent, setAttendanceEvent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [form, setForm] = useState({ name: '', venue_name: '', date: '', latitude: '', longitude: '' });
  const [formError, setFormError] = useState('');
  const [locating, setLocating] = useState(false);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${password}`,
  }), [password]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/events', { headers: headers() });
      if (!res.ok) throw new Error();
      setEvents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const login = async e => {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/admin/events', {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (res.ok) {
      localStorage.setItem(STORAGE_KEY, password);
      setAuthed(true);
      setEvents(await res.json());
    } else {
      setAuthError('Incorrect password.');
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setPassword('');
  };

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Create event ──────────────────────────────────────────────────────────
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => { setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const createEvent = async e => {
    e.preventDefault();
    setFormError('');
    const lat = parseFloat(form.latitude);
    const lon = parseFloat(form.longitude);
    if (!form.name || !form.venue_name || !form.date) {
      setFormError('Name, venue, and date are required.');
      return;
    }
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180) {
      setFormError('Enter valid latitude (−90 to 90) and longitude (−180 to 180).');
      return;
    }

    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...form, latitude: lat, longitude: lon }),
    });
    if (res.ok) {
      setForm({ name: '', venue_name: '', date: '', latitude: '', longitude: '' });
      setTab('events');
      fetchEvents();
      showFeedback('success', 'Event created successfully.');
    } else {
      const data = await res.json();
      setFormError(data.error || 'Failed to create event.');
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async event => {
    await fetch(`/api/admin/events/${event.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ is_active: event.is_active ? 0 : 1 }),
    });
    fetchEvents();
  };

  // ── Delete event ──────────────────────────────────────────────────────────
  const deleteEvent = async event => {
    if (!window.confirm(`Delete "${event.name}" and all its check-in records?`)) return;
    await fetch(`/api/admin/events/${event.id}`, { method: 'DELETE', headers: headers() });
    fetchEvents();
    showFeedback('success', 'Event deleted.');
  };

  // ── View attendance ───────────────────────────────────────────────────────
  const viewAttendance = async event => {
    setAttendanceEvent(event);
    setAttendanceLoading(true);
    const res = await fetch(`/api/admin/events/${event.id}/attendance`, { headers: headers() });
    setAttendance(await res.json());
    setAttendanceLoading(false);
  };

  const exportExcel = () => {
    const eventDate = new Date(attendanceEvent.date).toLocaleDateString();
    const wsData = [
      [`Event: ${attendanceEvent.name}`],
      [`Venue: ${attendanceEvent.venue_name}`],
      [`Date: ${eventDate}`],
      [`Total Check-ins: ${attendance.length}`],
      [],
      ['#', 'Volunteer Name', 'Check-in Time'],
      ...attendance.map((c, i) => [
        i + 1,
        c.volunteer_name,
        new Date(c.checked_in_at).toLocaleString(),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `${attendanceEvent.name.replace(/\s+/g, '_')}_attendance.xlsx`);
  };

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Admin Panel</h1>
          <p>Volunteer Sign-In</p>
        </div>
        <div className="card">
          <form onSubmit={login}>
            {authError && <div className="msg msg-error">{authError}</div>}
            <div className="form-group">
              <label htmlFor="admin-pw">Admin Password</label>
              <input
                id="admin-pw"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary">Sign In</button>
          </form>
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.8rem', color: '#718096' }}>
          Default password is <strong>admin123</strong> — change via <code>ADMIN_PASSWORD</code> env var
        </p>
      </div>
    );
  }

  // ── Attendance view ───────────────────────────────────────────────────────
  if (attendanceEvent) {
    return (
      <div className="page">
        <button className="btn btn-ghost" onClick={() => setAttendanceEvent(null)} style={{ marginBottom: 16 }}>
          ← Back to events
        </button>
        <div className="admin-header">
          <div>
            <h1 style={{ fontSize: '1.2rem' }}>{attendanceEvent.name}</h1>
            <p style={{ color: '#718096', fontSize: '0.85rem' }}>{attendanceEvent.venue_name}</p>
          </div>
          {attendance.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={exportExcel}>
              Export Excel
            </button>
          )}
        </div>

        {attendanceLoading && <div className="spinner">Loading…</div>}

        {!attendanceLoading && attendance.length === 0 && (
          <div className="empty">No check-ins yet.</div>
        )}

        {!attendanceLoading && attendance.length > 0 && (
          <>
            <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: 12 }}>
              {attendance.length} volunteer{attendance.length !== 1 ? 's' : ''} checked in
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((c, i) => (
                    <tr key={i}>
                      <td style={{ color: '#a0aec0' }}>{i + 1}</td>
                      <td>{c.volunteer_name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(c.checked_in_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Main admin dashboard ──────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: '#718096' }}>
          Log out
        </button>
      </div>

      {feedback && (
        <div className={`msg msg-${feedback.type}`}>{feedback.text}</div>
      )}

      <div className="tab-bar">
        <button className={`tab ${tab === 'events' ? 'active' : ''}`} onClick={() => { setTab('events'); fetchEvents(); }}>
          Events
        </button>
        <button className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
          + Create Event
        </button>
      </div>

      {/* ── Events list ── */}
      {tab === 'events' && (
        <>
          {loading && <div className="spinner">Loading…</div>}
          {!loading && events.length === 0 && (
            <div className="empty">No events yet. Create one to get started.</div>
          )}
          {events.map(ev => (
            <div key={ev.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>{ev.name}</h3>
                  <p className="meta">{ev.venue_name}</p>
                  <p className="meta">
                    {new Date(ev.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <span className={`count-pill`}>{ev.checkin_count} checked in</span>
              </div>
              <span className={`badge ${ev.is_active ? 'badge-active' : 'badge-inactive'}`}>
                {ev.is_active ? 'Active' : 'Inactive'}
              </span>
              <div className="event-row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => viewAttendance(ev)}>
                  View Attendance
                </button>
                <button
                  className={`btn btn-sm ${ev.is_active ? 'btn-secondary' : 'btn-success'}`}
                  onClick={() => toggleActive(ev)}
                >
                  {ev.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteEvent(ev)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Create event form ── */}
      {tab === 'create' && (
        <div className="card">
          <h3 style={{ marginBottom: 18 }}>New Event</h3>
          <form onSubmit={createEvent}>
            {formError && <div className="msg msg-error">{formError}</div>}

            <div className="form-group">
              <label>Event Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Beach Cleanup 2025"
              />
            </div>

            <div className="form-group">
              <label>Venue Name</label>
              <input
                type="text"
                value={form.venue_name}
                onChange={e => setForm(f => ({ ...f, venue_name: e.target.value }))}
                placeholder="e.g. Repulse Bay Beach"
              />
            </div>

            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            <hr className="divider" />

            <div className="form-group">
              <label>Venue Coordinates</label>
              <div className="input-row" style={{ marginBottom: 8 }}>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                  placeholder="Longitude"
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={useMyLocation}
                disabled={locating}
              >
                {locating ? '📡 Locating…' : '📍 Use My Current Location'}
              </button>
              <p style={{ fontSize: '0.78rem', color: '#718096', marginTop: 6 }}>
                Tip: open Google Maps, long-press the venue, and copy the coordinates shown.
              </p>
            </div>

            <button type="submit" className="btn btn-primary">
              Create Event
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
