const crypto = require("crypto");
const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const USE_SSL =
  process.env.PGSSLMODE === "require" ||
  process.env.PGSSL === "true" ||
  process.env.NODE_ENV === "production";
const DB_CONFIG = {
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "1234",
  database: process.env.PGDATABASE || "nonogram_prod",
  ssl: USE_SSL ? { rejectUnauthorized: false } : false,
};

const app = express();
const pool = new Pool(DB_CONFIG);
const raceRooms = new Map();
const ROOM_TTL_MS = 1000 * 60 * 60 * 12;
const COUNTDOWN_MS = 5000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) {
  let n = i;
  let c = 0;
  while (n) {
    n &= n - 1;
    c += 1;
  }
  POPCOUNT[i] = c;
}

app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.json({ limit: "1mb" }));

function expectedByteLength(width, height) {
  return Math.ceil((width * height) / 8);
}

function packCells(cells, width, height) {
  const n = width * height;
  if (!Array.isArray(cells) || cells.length !== n) {
    throw new Error(`cells must be an array with length ${n}`);
  }

  const out = Buffer.alloc(expectedByteLength(width, height));
  for (let i = 0; i < n; i += 1) {
    const v = Number(cells[i]);
    if (v !== 0 && v !== 1) {
      throw new Error("cells must contain only 0 or 1");
    }
    if (v === 1) {
      out[Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }
  return out;
}

function parseUserBits(body, width, height) {
  if (typeof body.userBitsBase64 === "string") {
    return Buffer.from(body.userBitsBase64, "base64");
  }
  if (typeof body.userBitsHex === "string") {
    return Buffer.from(body.userBitsHex, "hex");
  }
  if (Array.isArray(body.cells)) {
    return packCells(body.cells, width, height);
  }
  throw new Error("Provide one of: userBitsBase64, userBitsHex, or cells");
}

function popcountBuffer(buf) {
  let total = 0;
  for (let i = 0; i < buf.length; i += 1) total += POPCOUNT[buf[i]];
  return total;
}

function countCorrectAnswerCells(solutionBits, userBits) {
  let total = 0;
  const len = Math.min(solutionBits.length, userBits.length);
  for (let i = 0; i < len; i += 1) total += POPCOUNT[solutionBits[i] & userBits[i]];
  return total;
}

async function loadSolutionBitsHexById(puzzleId) {
  const { rows } = await pool.query(
    `SELECT encode(solution_bits, 'hex') AS solution_hex
     FROM puzzles
     WHERE id = $1`,
    [puzzleId]
  );
  if (!rows.length || !rows[0].solution_hex) return null;
  return Buffer.from(rows[0].solution_hex, "hex");
}

function toSolutionBits(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.from(raw);
  if (raw && typeof raw === "object" && Array.isArray(raw.data)) {
    return Buffer.from(raw.data);
  }
  if (raw && typeof raw === "object" && raw.type === "Buffer" && Array.isArray(raw.data)) {
    return Buffer.from(raw.data);
  }
  if (typeof raw === "string") {
    if (raw.startsWith("\\x")) return Buffer.from(raw.slice(2), "hex");
    return Buffer.from(raw, "base64");
  }
  return null;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomPlayerId() {
  return crypto.randomBytes(12).toString("hex");
}

function makeRoomCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = randomCode();
    if (!raceRooms.has(code)) return code;
  }
  return `${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

function normalizeNickname(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s.slice(0, 24);
}

function normalizeUsername(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s.length < 3 || s.length > 24) return null;
  return s.slice(0, 24);
}

function normalizeUserPassword(raw) {
  const s = String(raw || "");
  if (s.length < 8 || s.length > 72) return null;
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return null;
  return s;
}

function normalizeRoomTitle(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Race Room";
  return s.slice(0, 40);
}

function normalizeVisibility(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "private" ? "private" : "public";
}

function normalizePassword(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.slice(0, 64);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashUserPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyUserPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

async function createSessionForUser(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt.toISOString()]
  );
  return token;
}

async function getAuthUserFromReq(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.nickname
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows.length) return null;
  return { ...rows[0], token, tokenHash };
}

async function requireAuth(req, res, next) {
  try {
    const user = await getAuthUserFromReq(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Login required" });
    }
    req.authUser = user;
    return next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function ensureAuthTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(24) UNIQUE NOT NULL,
      nickname VARCHAR(24) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);`
  );
}

function normalizeMaxPlayers(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return 2;
  return Math.max(2, Math.min(4, n));
}

function syncRoomState(room) {
  if (room.state === "countdown" && room.gameStartAt && Date.now() >= room.gameStartAt) {
    room.state = "playing";
  }
}

function canStartRoom(room) {
  const activePlayers = Array.from(room.players.values()).filter((p) => !p.disconnectedAt);
  if (activePlayers.length < 2) return false;
  return activePlayers.every((p) => p.isReady === true);
}

function getFinishedPlayers(room) {
  return Array.from(room.players.values())
    .filter((p) => Number.isInteger(p.elapsedSec))
    .sort((a, b) => {
      if (a.elapsedSec !== b.elapsedSec) return a.elapsedSec - b.elapsedSec;
      if (a.finishedAt && b.finishedAt) return a.finishedAt > b.finishedAt ? 1 : -1;
      return 0;
    });
}

function buildRankings(room) {
  const finished = getFinishedPlayers(room).map((p, idx) => ({
    rank: idx + 1,
    playerId: p.playerId,
    nickname: p.nickname,
    elapsedSec: p.elapsedSec,
    status: "finished",
  }));

  const unfinished = Array.from(room.players.values())
    .filter((p) => !Number.isInteger(p.elapsedSec))
    .map((p) => ({
      rank: null,
      playerId: p.playerId,
      nickname: p.nickname,
      elapsedSec: null,
      status: p.disconnectedAt ? "left" : "dnf",
    }))
    .sort((a, b) => (a.nickname > b.nickname ? 1 : -1));

  return [...finished, ...unfinished];
}

function shouldFinishRace(room) {
  const finishedCount = getFinishedPlayers(room).length;
  const target = room.finishTarget || 1;
  if (finishedCount >= target) return true;

  const activeCount = Array.from(room.players.values()).filter(
    (p) => !Number.isInteger(p.elapsedSec) && !p.disconnectedAt
  ).length;
  return finishedCount + activeCount < target;
}

function roomPublicState(room) {
  syncRoomState(room);
  const rankings = buildRankings(room);
  const players = Array.from(room.players.values())
    .map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      joinedAt: p.joinedAt,
      finishedAt: p.finishedAt,
      elapsedSec: p.elapsedSec,
      isReady: p.isReady,
      disconnectedAt: p.disconnectedAt || null,
      correctAnswerCells: p.correctAnswerCells ?? 0,
      remainingAnswerCells: Math.max(0, (room.totalAnswerCells || 0) - (p.correctAnswerCells || 0)),
    }))
    .sort((a, b) => (a.joinedAt > b.joinedAt ? 1 : -1));
  const winner = rankings.find((r) => r.rank === 1) || null;
  const finishedCount = rankings.filter((r) => r.status === "finished").length;
  return {
    roomCode: room.roomCode,
    roomTitle: room.roomTitle,
    visibility: room.visibility,
    isPrivate: room.visibility === "private",
    puzzleId: room.puzzleId,
    totalAnswerCells: room.totalAnswerCells || 0,
    maxPlayers: room.maxPlayers,
    finishTarget: room.finishTarget || 1,
    width: room.width,
    height: room.height,
    createdAt: room.createdAt,
    hostPlayerId: room.hostPlayerId,
    state: room.state,
    countdownStartAt: room.countdownStartAt,
    gameStartAt: room.gameStartAt,
    canStart: canStartRoom(room),
    winnerPlayerId: room.winnerPlayerId,
    finishedCount,
    rankings,
    players,
    winner,
    isFinished: room.state === "finished",
    serverNow: Date.now(),
  };
}

function roomListItem(room) {
  syncRoomState(room);
  return {
    roomCode: room.roomCode,
    roomTitle: room.roomTitle,
    visibility: room.visibility,
    isPrivate: room.visibility === "private",
    width: room.width,
    height: room.height,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.size,
    state: room.state,
    createdAt: room.createdAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of raceRooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      raceRooms.delete(code);
    }
  }
}, 1000 * 60 * 15);

setInterval(async () => {
  try {
    await pool.query(`DELETE FROM user_sessions WHERE expires_at <= now()`);
  } catch {
    // ignore cleanup failures
  }
}, 1000 * 60 * 30);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/auth/signup", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const nickname = normalizeNickname(req.body?.nickname);
  const password = normalizeUserPassword(req.body?.password);
  if (!username) {
    return res.status(400).json({ ok: false, error: "username must be 3-24 chars" });
  }
  if (!nickname) {
    return res.status(400).json({ ok: false, error: "nickname is required" });
  }
  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: "password must be 8+ chars and include letters and numbers" });
  }
  try {
    const passwordHash = hashUserPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (username, nickname, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, nickname`,
      [username, nickname, passwordHash]
    );
    const user = rows[0];
    const token = await createSessionForUser(user.id);
    return res.json({ ok: true, token, user });
  } catch (err) {
    if (String(err.message || "").includes("users_username_key")) {
      return res.status(409).json({ ok: false, error: "username already exists" });
    }
    if (String(err.message || "").includes("users_nickname_key")) {
      return res.status(409).json({ ok: false, error: "nickname already exists" });
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username/password are required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, username, nickname, password_hash
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username]
    );
    if (!rows.length) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    const user = rows[0];
    if (!verifyUserPassword(password, user.password_hash)) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    const token = await createSessionForUser(user.id);
    return res.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  return res.json({
    ok: true,
    user: {
      id: req.authUser.id,
      username: req.authUser.username,
      nickname: req.authUser.nickname,
    },
  });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM user_sessions WHERE token_hash = $1`, [req.authUser.tokenHash]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/puzzles/:id", async (req, res) => {
  const puzzleId = Number(req.params.id);
  if (!Number.isInteger(puzzleId)) {
    return res.status(400).json({ ok: false, error: "Invalid puzzle id" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, width, height, row_hints, col_hints, is_unique
       FROM puzzles
       WHERE id = $1`,
      [puzzleId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Puzzle not found" });
    }
    return res.json({ ok: true, puzzle: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const getRandomPuzzleBySize = async (req, res) => {
  const width = Number(req.query?.width);
  const height = Number(req.query?.height);

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return res.status(400).json({ ok: false, error: "width/height are required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, width, height, row_hints, col_hints, is_unique, solution_bits
       FROM puzzles
       WHERE width = $1 AND height = $2 AND solution_bits IS NOT NULL
       ORDER BY random()
       LIMIT 1`,
      [width, height]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "No puzzle found for size" });
    }

    return res.json({ ok: true, puzzle: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

app.get("/puzzles-random", getRandomPuzzleBySize);
app.get("/puzzles/random", getRandomPuzzleBySize);
app.get("/race-rooms", (_req, res) => {
  const rooms = Array.from(raceRooms.values())
    .map(roomListItem)
    .filter((room) => room.state === "lobby" && room.currentPlayers < room.maxPlayers)
    .sort((a, b) => b.createdAt - a.createdAt);
  return res.json({ ok: true, rooms });
});

app.post("/race/create", requireAuth, async (req, res) => {
  const nickname = req.authUser.nickname;
  const roomTitle = normalizeRoomTitle(req.body?.roomTitle);
  const maxPlayers = normalizeMaxPlayers(req.body?.maxPlayers);
  const visibility = normalizeVisibility(req.body?.visibility);
  const roomPassword = normalizePassword(req.body?.password);
  const width = Number(req.body?.width);
  const height = Number(req.body?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return res.status(400).json({ ok: false, error: "width/height are required" });
  }
  if (visibility === "private" && !roomPassword) {
    return res.status(400).json({ ok: false, error: "password is required for private room" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, width, height, row_hints, col_hints, is_unique, solution_bits
       FROM puzzles
       WHERE width = $1 AND height = $2 AND solution_bits IS NOT NULL
       ORDER BY random()
       LIMIT 1`,
      [width, height]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "No puzzle found for size" });
    }

    const puzzle = rows[0];
    const puzzleForClient = {
      id: puzzle.id,
      width: puzzle.width,
      height: puzzle.height,
      row_hints: puzzle.row_hints,
      col_hints: puzzle.col_hints,
      is_unique: puzzle.is_unique,
    };
    const roomCode = makeRoomCode();
    const playerId = randomPlayerId();
    const nowIso = new Date().toISOString();
    let solutionBits = toSolutionBits(puzzle.solution_bits);
    if (!solutionBits) {
      solutionBits = await loadSolutionBitsHexById(puzzle.id);
    }
    if (!solutionBits) {
      return res.status(500).json({ ok: false, error: "Puzzle solution_bits is missing" });
    }
    const room = {
      roomCode,
      roomTitle,
      visibility,
      passwordHash: visibility === "private" ? hashPassword(roomPassword) : null,
      puzzleId: puzzle.id,
      solutionBits,
      totalAnswerCells: popcountBuffer(solutionBits),
      maxPlayers,
      finishTarget: 1,
      width: puzzle.width,
      height: puzzle.height,
      createdAt: Date.now(),
      hostPlayerId: playerId,
      state: "lobby",
      countdownStartAt: null,
      gameStartAt: null,
      winnerPlayerId: null,
      players: new Map(),
    };
    room.players.set(playerId, {
      playerId,
      userId: req.authUser.id,
      nickname,
      joinedAt: nowIso,
      finishedAt: null,
      elapsedSec: null,
      isReady: false,
      disconnectedAt: null,
      correctAnswerCells: 0,
    });
    raceRooms.set(roomCode, room);

    return res.json({
      ok: true,
      roomCode,
      playerId,
      puzzle: puzzleForClient,
      room: roomPublicState(room),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/race/join", requireAuth, async (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const nickname = req.authUser.nickname;
  const password = normalizePassword(req.body?.password);
  if (!roomCode) {
    return res.status(400).json({ ok: false, error: "roomCode is required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  if (room.visibility === "private") {
    if (!password || hashPassword(password) !== room.passwordHash) {
      return res.status(403).json({ ok: false, error: "Invalid room password" });
    }
  }
  if (room.players.size >= room.maxPlayers) {
    return res.status(400).json({ ok: false, error: "Room is full" });
  }
  const alreadyInRoom = Array.from(room.players.values()).some((p) => p.userId === req.authUser.id);
  if (alreadyInRoom) {
    return res.status(400).json({ ok: false, error: "You are already in this room" });
  }
  syncRoomState(room);
  if (room.state !== "lobby") {
    return res.status(400).json({ ok: false, error: "Room already started" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, width, height, row_hints, col_hints, is_unique
       FROM puzzles
       WHERE id = $1`,
      [room.puzzleId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Puzzle not found for room" });
    }

    const playerId = randomPlayerId();
    room.players.set(playerId, {
      playerId,
      userId: req.authUser.id,
      nickname,
      joinedAt: new Date().toISOString(),
      finishedAt: null,
      elapsedSec: null,
      isReady: false,
      disconnectedAt: null,
      correctAnswerCells: 0,
    });

    return res.json({
      ok: true,
      roomCode,
      playerId,
      puzzle: rows[0],
      room: roomPublicState(room),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/race/ready", (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  const ready = Boolean(req.body?.ready);
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  syncRoomState(room);
  if (room.state !== "lobby") {
    return res.status(400).json({ ok: false, error: "Cannot change ready after start" });
  }
  const player = room.players.get(playerId);
  if (!player) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }
  player.isReady = ready;
  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/start", (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  syncRoomState(room);
  if (room.state !== "lobby") {
    return res.status(400).json({ ok: false, error: "Room already started" });
  }
  if (room.hostPlayerId !== playerId) {
    return res.status(403).json({ ok: false, error: "Only host can start" });
  }
  if (!canStartRoom(room)) {
    return res.status(400).json({ ok: false, error: "All players must be ready (min 2 players)" });
  }

  const now = Date.now();
  room.state = "countdown";
  room.countdownStartAt = now;
  room.gameStartAt = now + COUNTDOWN_MS;
  room.winnerPlayerId = null;
  room.finishTarget = Math.max(1, room.players.size - 1);
  for (const p of room.players.values()) {
    p.finishedAt = null;
    p.elapsedSec = null;
    p.disconnectedAt = null;
    p.correctAnswerCells = 0;
  }

  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/progress", async (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }

  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  syncRoomState(room);
  const player = room.players.get(playerId);
  if (!player) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }
  if (room.state !== "playing" && room.state !== "finished") {
    return res.status(400).json({ ok: false, error: "Race has not started yet" });
  }
  try {
    if (!room.solutionBits) {
      room.solutionBits = await loadSolutionBitsHexById(room.puzzleId);
      room.totalAnswerCells = room.solutionBits ? popcountBuffer(room.solutionBits) : 0;
    }
    if (!room.solutionBits) {
      return res.status(500).json({ ok: false, error: "Puzzle solution_bits is missing" });
    }
    const userBits = parseUserBits(req.body, room.width, room.height);
    const expectedLen = expectedByteLength(room.width, room.height);
    if (userBits.length !== expectedLen) {
      return res.status(400).json({
        ok: false,
        error: `Invalid bit length: got ${userBits.length}, expected ${expectedLen}`,
      });
    }
    player.correctAnswerCells = countCorrectAnswerCells(room.solutionBits, userBits);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/rematch", async (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  if (!room.players.has(playerId)) {
    return res.status(403).json({ ok: false, error: "Only room members can request rematch" });
  }
  if (room.state !== "finished") {
    return res.status(400).json({ ok: false, error: "Rematch is available only after finish" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, width, height, row_hints, col_hints, is_unique, solution_bits
       FROM puzzles
       WHERE width = $1 AND height = $2 AND solution_bits IS NOT NULL
       ORDER BY random()
       LIMIT 1`,
      [room.width, room.height]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "No puzzle found for size" });
    }
    const puzzle = rows[0];
    const puzzleForClient = {
      id: puzzle.id,
      width: puzzle.width,
      height: puzzle.height,
      row_hints: puzzle.row_hints,
      col_hints: puzzle.col_hints,
      is_unique: puzzle.is_unique,
    };
    let solutionBits = toSolutionBits(puzzle.solution_bits);
    if (!solutionBits) {
      solutionBits = await loadSolutionBitsHexById(puzzle.id);
    }
    if (!solutionBits) {
      return res.status(500).json({ ok: false, error: "Puzzle solution_bits is missing" });
    }
    room.puzzleId = puzzle.id;
    room.solutionBits = solutionBits;
    room.totalAnswerCells = popcountBuffer(solutionBits);
    room.state = "lobby";
    room.countdownStartAt = null;
    room.gameStartAt = null;
    room.winnerPlayerId = null;
    room.finishTarget = Math.max(1, room.players.size - 1);
    for (const p of room.players.values()) {
      p.isReady = false;
      p.finishedAt = null;
      p.elapsedSec = null;
      p.disconnectedAt = null;
      p.correctAnswerCells = 0;
    }
    return res.json({ ok: true, puzzle: puzzleForClient, room: roomPublicState(room) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/race/:roomCode", (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/finish", async (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  const elapsedSec = Number(req.body?.elapsedSec);
  if (!roomCode || !playerId || !Number.isFinite(elapsedSec)) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId/elapsedSec are required" });
  }

  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  syncRoomState(room);
  if (room.state !== "playing" && room.state !== "finished") {
    return res.status(400).json({ ok: false, error: "Race has not started yet" });
  }
  const player = room.players.get(playerId);
  if (!player) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }

  if (!Number.isInteger(player.elapsedSec)) {
    if (!room.totalAnswerCells || !room.solutionBits) {
      room.solutionBits = room.solutionBits || (await loadSolutionBitsHexById(room.puzzleId));
      room.totalAnswerCells = room.solutionBits ? popcountBuffer(room.solutionBits) : 0;
    }
    player.elapsedSec = Math.max(0, Math.floor(elapsedSec));
    player.finishedAt = new Date().toISOString();
    player.correctAnswerCells = room.totalAnswerCells || player.correctAnswerCells || 0;
  }
  const finished = getFinishedPlayers(room);
  if (!room.winnerPlayerId && finished.length > 0) {
    room.winnerPlayerId = finished[0].playerId;
  }
  if (shouldFinishRace(room)) {
    room.state = "finished";
  }

  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/leave", (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  const player = room.players.get(playerId);
  if (!player) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }

  if (room.state === "lobby") {
    const wasHost = room.hostPlayerId === playerId;
    room.players.delete(playerId);

    if (room.players.size === 0) {
      raceRooms.delete(roomCode);
      return res.json({ ok: true, roomDeleted: true });
    }

    if (wasHost) {
      const nextHost = Array.from(room.players.values()).sort((a, b) =>
        a.joinedAt > b.joinedAt ? 1 : -1
      )[0];
      room.hostPlayerId = nextHost.playerId;
    }
    return res.json({ ok: true, room: roomPublicState(room) });
  }

  if (!player.disconnectedAt) {
    player.disconnectedAt = new Date().toISOString();
  }
  player.isReady = false;

  const finished = getFinishedPlayers(room);
  if (!room.winnerPlayerId && finished.length > 0) {
    room.winnerPlayerId = finished[0].playerId;
  }
  if (room.state === "playing" && shouldFinishRace(room)) {
    room.state = "finished";
  }

  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/verify", async (req, res) => {
  const puzzleId = Number(req.body?.puzzleId);
  if (!Number.isInteger(puzzleId)) {
    return res.status(400).json({ ok: false, error: "puzzleId is required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT width, height, solution_bits, is_unique
       FROM puzzles
       WHERE id = $1`,
      [puzzleId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Puzzle not found" });
    }

    const row = rows[0];
    const expectedLen = expectedByteLength(row.width, row.height);
    const userBits = parseUserBits(req.body, row.width, row.height);

    if (userBits.length !== expectedLen) {
      return res.status(400).json({
        ok: false,
        error: `Invalid bit length: got ${userBits.length}, expected ${expectedLen}`,
      });
    }

    const isCorrect =
      row.solution_bits.length === userBits.length &&
      crypto.timingSafeEqual(row.solution_bits, userBits);

    return res.json({
      ok: true,
      isCorrect,
      isUnique: row.is_unique,
      width: row.width,
      height: row.height,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

async function startServer() {
  await ensureAuthTables();
  app.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
