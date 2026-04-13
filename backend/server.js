const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors());
app.use(express.json());

// ── JSON file database ────────────────────────────────────────────────────────

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'db.json');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { events: [], checkins: [], nextEventId: 1, nextCheckinId: 1 };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Haversine distance in metres ──────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Admin auth middleware ─────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Public routes ─────────────────────────────────────────────────────────────

// List active events (for volunteers)
app.get('/api/events', (_req, res) => {
  const db = readDB();
  const active = db.events
    .filter(e => e.is_active)
    .map(({ id, name, venue_name, date }) => ({ id, name, venue_name, date }))
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json(active);
});

// Volunteer check-in
app.post('/api/checkin', (req, res) => {
  const { event_id, volunteer_name, latitude, longitude } = req.body;

  if (!event_id || !volunteer_name?.trim() || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const db = readDB();
  const event = db.events.find(e => e.id === event_id && e.is_active);

  if (!event) {
    return res.status(404).json({ error: 'Event not found or no longer active.' });
  }

  const distance = haversineDistance(latitude, longitude, event.latitude, event.longitude);
  if (distance > 100) {
    return res.status(403).json({
      error: `You are ${Math.round(distance)} m from the venue. You must be within 100 m to check in.`,
      distance: Math.round(distance),
    });
  }

  const name = volunteer_name.trim();
  const duplicate = db.checkins.find(
    c => c.event_id === event_id && c.volunteer_name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return res.status(409).json({ error: 'You have already checked in to this event.' });
  }

  db.checkins.push({
    id: db.nextCheckinId++,
    event_id,
    volunteer_name: name,
    checked_in_at: new Date().toISOString(),
    latitude,
    longitude,
  });
  writeDB(db);

  res.json({ success: true, distance: Math.round(distance) });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// All events with check-in counts
app.get('/api/admin/events', requireAdmin, (_req, res) => {
  const db = readDB();
  const result = db.events
    .map(e => ({
      ...e,
      checkin_count: db.checkins.filter(c => c.event_id === e.id).length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(result);
});

// Create event
app.post('/api/admin/events', requireAdmin, (req, res) => {
  const { name, venue_name, latitude, longitude, date } = req.body;
  if (!name || !venue_name || latitude == null || longitude == null || !date) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const db = readDB();
  const event = {
    id: db.nextEventId++,
    name: name.trim(),
    venue_name: venue_name.trim(),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    date,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  db.events.push(event);
  writeDB(db);
  res.status(201).json({ id: event.id });
});

// Toggle active
app.patch('/api/admin/events/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const event = db.events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  event.is_active = req.body.is_active === 1 || req.body.is_active === true;
  writeDB(db);
  res.json({ success: true });
});

// Delete event (also removes its check-ins)
app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  db.events = db.events.filter(e => e.id !== id);
  db.checkins = db.checkins.filter(c => c.event_id !== id);
  writeDB(db);
  res.json({ success: true });
});

// Attendance for one event
app.get('/api/admin/events/:id/attendance', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  const checkins = db.checkins
    .filter(c => c.event_id === id)
    .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
    .map(({ volunteer_name, checked_in_at, latitude, longitude }) => ({
      volunteer_name, checked_in_at, latitude, longitude,
    }));
  res.json(checkins);
});

// ── Serve frontend in production ──────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\nVolunteer Sign-In server running on http://localhost:${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}\n`);
});
