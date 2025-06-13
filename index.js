// Required dependencies
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const bodyParser = require('body-parser');

app.use(cors());
app.use(bodyParser.json());

// In-memory cache
const matchTimers = new Map();

// Utility: Convert time string ("4:00") to seconds
const timeStringToSeconds = (str) => {
  const [min, sec] = str.split(':').map(Number);
  return (min * 60) + (sec || 0);
};

// Utility: Convert seconds to "MM:SS"
const secondsToTimeString = (sec) => {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
};

// POST /start-timer
app.post('/start-timer', (req, res) => {
  const { AwayTeamId, HomeTeamId, LatestEvent } = req.body;
  const matchKey = `${AwayTeamId}-${HomeTeamId}`;

  if (!AwayTeamId || !HomeTeamId || !LatestEvent) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const now = Date.now();
  const newBaseSeconds = timeStringToSeconds(LatestEvent);

  const existing = matchTimers.get(matchKey);
  const shouldUpdate = !existing || existing.baseSeconds !== newBaseSeconds;

  if (shouldUpdate) {
    matchTimers.set(matchKey, { startTime: now, baseSeconds: newBaseSeconds });

    // Emit immediately to all clients
    const updatedTimer = secondsToTimeString(newBaseSeconds);
    io.emit('timer-update', { matchKey, timer: updatedTimer });
  }

  const { startTime, baseSeconds } = matchTimers.get(matchKey);
  const elapsed = Math.floor((now - startTime) / 1000);
  return res.json({ timer: secondsToTimeString(baseSeconds + elapsed) });
});

// WebSocket: Send updates to clients
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('subscribe-to-match', ({ AwayTeamId, HomeTeamId }) => {
    const matchKey = `${AwayTeamId}-${HomeTeamId}`;

    const interval = setInterval(() => {
      const matchInfo = matchTimers.get(matchKey);
      if (!matchInfo) return;

      const { startTime, baseSeconds } = matchInfo;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timer = secondsToTimeString(baseSeconds + elapsed);
      socket.emit('timer-update', { matchKey, timer });
    }, 1000);

    socket.on('disconnect', () => clearInterval(interval));
  });
});

// Start the server
server.listen(4000, () => console.log('Server running on http://localhost:4000'));
