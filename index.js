const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(bodyParser.json());

// In-memory cache
const matchTimers = new Map();

// Converts "1:48" → 108 seconds
const timeStringToSeconds = (str) => {
  const [min, sec] = str.split(':').map(Number);
  return (min * 60) + (sec || 0);
};

// Converts 108 → "01:48"
const secondsToTimeString = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    const hh = String(h).padStart(2, '0');
    return `${hh}:${mm}:${ss}`; // Show full format if hours > 0
  }

  return `${mm}:${ss}`; // Show only MM:SS if hours = 0
};


// POST /start-timer
app.post('/start-timer', (req, res) => {
  const { AwayTeamId, HomeTeamId, LatestEvent, EventStartTiming } = req.body;
  const matchKey = `${AwayTeamId}-${HomeTeamId}`;

  if (!AwayTeamId || !HomeTeamId || !LatestEvent || !EventStartTiming) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const now = new Date().getTime();
  const eventStartMs = new Date(EventStartTiming).getTime();
  if (isNaN(eventStartMs)) {
    return res.status(400).json({ error: 'Invalid EventStartTiming format' });
  }

  const eventElapsed = Math.floor((now - eventStartMs) / 1000); // in seconds
  const latestEventSec = timeStringToSeconds(LatestEvent);
  const adjustedBaseSeconds = latestEventSec + eventElapsed;

  // Always update matchTimer
  matchTimers.set(matchKey, {
    startTime: now,
    baseSeconds: adjustedBaseSeconds
  });

  const timerString = secondsToTimeString(adjustedBaseSeconds);
  io.emit('timer-update', { matchKey, timer: timerString });

  return res.json({ timer: timerString });
});

// WebSocket live timer
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('subscribe-to-match', ({ AwayTeamId, HomeTeamId }) => {
    const matchKey = `${AwayTeamId}-${HomeTeamId}`;

    const interval = setInterval(() => {
      const match = matchTimers.get(matchKey);
      if (!match) return;

      const now = Date.now();
      const elapsed = Math.floor((now - match.startTime) / 1000); // seconds since server stored
      const totalSeconds = match.baseSeconds + elapsed;

      const timer = secondsToTimeString(totalSeconds);
      socket.emit('timer-update', { matchKey, timer });
    }, 1000);

    socket.on('disconnect', () => {
      clearInterval(interval);
      console.log('Client disconnected');
    });
  });
});

server.listen(4000, () => console.log('Server running on http://localhost:4000'));
