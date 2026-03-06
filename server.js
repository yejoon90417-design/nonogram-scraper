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
const pvpQueueTickets = new Map();
const pvpUserTicket = new Map();
const pvpWaitingOrder = [];
const pvpMatches = new Map();
const ROOM_TTL_MS = 1000 * 60 * 60 * 12;
const PLAYER_STALE_MS = 1000 * 45;
const COUNTDOWN_MS = 5000;
const PVP_QUEUE_STALE_MS = 1000 * 60 * 2;
const PVP_MATCH_TICKET_TTL_MS = 1000 * 60 * 5;
const PVP_ACCEPT_MS = 12000;
const PVP_BAN_MS = 10000;
const PVP_REVEAL_MS = 4200;
const PVP_BOT_ENABLED = process.env.PVP_BOT_ENABLED !== "false";
const PVP_BOT_WAIT_MS = Math.max(3000, Number(process.env.PVP_BOT_WAIT_MS || 12000));
const PVP_BOT_POOL_MIN = 8;
const PVP_FAKE_QUEUE_ENABLED = process.env.PVP_FAKE_QUEUE_ENABLED !== "false";
const PVP_FAKE_QUEUE_MIN = Math.max(0, Number(process.env.PVP_FAKE_QUEUE_MIN || 0));
const PVP_FAKE_QUEUE_MAX = Math.max(PVP_FAKE_QUEUE_MIN, Number(process.env.PVP_FAKE_QUEUE_MAX || 6));
const PVP_FAKE_QUEUE_UPDATE_MS = Math.max(1200, Number(process.env.PVP_FAKE_QUEUE_UPDATE_MS || 3200));
const PVP_SIZE_OPTIONS = [
  [5, 5],
  [10, 10],
  [15, 15],
  [20, 20],
  [25, 25],
];
const PVP_BOT_NAME_POOL = [
  "Mina", "Jisoo", "Hana", "Yuna", "Sora", "Aria", "Noah", "Liam",
  "Ava", "Ella", "Sena", "Haru", "Minji", "Yejin", "Rina", "Nari",
  "Leo", "Nico", "Jude", "Evan", "Kira", "Ryu", "Dami", "Suji",
];
const BOT_DIFFICULTY_WEIGHTS = [
  ["easy", 40],
  ["normal", 40],
  ["hard", 20],
];
const BOT_DIFFICULTY_CONFIG = {
  easy: {
    acceptMin: 3800,
    acceptMax: 7600,
    banMin: 4200,
    banMax: 8000,
    skipBanRate: 0.55,
    targetMinMul: 2.3,
    targetMaxMul: 3.2,
  },
  normal: {
    acceptMin: 3000,
    acceptMax: 6200,
    banMin: 3200,
    banMax: 6800,
    skipBanRate: 0.45,
    targetMinMul: 1.8,
    targetMaxMul: 2.6,
  },
  hard: {
    acceptMin: 2200,
    acceptMax: 4800,
    banMin: 2400,
    banMax: 5200,
    skipBanRate: 0.35,
    targetMinMul: 1.45,
    targetMaxMul: 2.0,
  },
};
const BOT_SOLVE_TIME_RANGE_SEC = {
  "5x5": {
    easy: [120, 180],
    normal: [50, 120],
    hard: [15, 30],
  },
  "10x10": {
    easy: [300, 360],
    normal: [120, 240],
    hard: [60, 90],
  },
  "15x15": {
    easy: [960, 1500],
    normal: [600, 900],
    hard: [300, 420],
  },
  "20x20": {
    easy: [1500, 1800],
    normal: [900, 1200],
    hard: [420, 600],
  },
  "25x25": {
    easy: [2700, 3000],
    normal: [1260, 2100],
    hard: [900, 1200],
  },
};
const ELO_DEFAULT_RATING = 1500;
const ELO_PLACEMENT_GAMES = 20;
const ELO_K_PLACEMENT = 40;
const ELO_K_NORMAL = 24;
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
let pvpFakeQueueCurrent = 0;
let pvpFakeQueueUpdatedAt = 0;

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

function normalizeChatText(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s.slice(0, 200);
}

function normalizeReactionEmoji(raw) {
  const s = String(raw || "").trim();
  if (s === "💩" || s === "👍" || s === "❤️") return s;
  return null;
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
    `SELECT u.id, u.username, u.nickname, u.rating, u.rating_games, u.rating_wins, u.rating_losses
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
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT ${ELO_DEFAULT_RATING},
      ADD COLUMN IF NOT EXISTS rating_games INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rating_wins INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rating_losses INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS bot_skill VARCHAR(16);
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_users_rating_desc ON users (rating DESC, rating_games DESC, id ASC);`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_is_bot ON users (is_bot);`);
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

function randomInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function randomFrom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function updatePvpFakeQueue(now = Date.now()) {
  if (!PVP_FAKE_QUEUE_ENABLED) {
    pvpFakeQueueCurrent = 0;
    pvpFakeQueueUpdatedAt = now;
    return;
  }
  if (pvpFakeQueueUpdatedAt > 0 && now - pvpFakeQueueUpdatedAt < PVP_FAKE_QUEUE_UPDATE_MS) return;
  pvpFakeQueueUpdatedAt = now;
  if (pvpFakeQueueCurrent <= 0 && PVP_FAKE_QUEUE_MAX > 0) {
    pvpFakeQueueCurrent = randomInt(PVP_FAKE_QUEUE_MIN, PVP_FAKE_QUEUE_MAX);
    return;
  }
  const driftTarget = randomInt(PVP_FAKE_QUEUE_MIN, PVP_FAKE_QUEUE_MAX);
  const step = randomInt(0, 2);
  if (step <= 0) return;
  if (driftTarget > pvpFakeQueueCurrent) {
    pvpFakeQueueCurrent = Math.min(PVP_FAKE_QUEUE_MAX, pvpFakeQueueCurrent + step);
  } else if (driftTarget < pvpFakeQueueCurrent) {
    pvpFakeQueueCurrent = Math.max(PVP_FAKE_QUEUE_MIN, pvpFakeQueueCurrent - step);
  }
}

function getVisiblePvpQueueSize(now = Date.now()) {
  updatePvpFakeQueue(now);
  const real = pvpWaitingOrder.length;
  if (!PVP_FAKE_QUEUE_ENABLED) return real;
  return Math.max(real, real + pvpFakeQueueCurrent);
}

function pickRandomBotDifficulty() {
  const total = BOT_DIFFICULTY_WEIGHTS.reduce((acc, [, w]) => acc + Number(w || 0), 0);
  if (total <= 0) return "normal";
  let x = Math.random() * total;
  for (const [difficulty, weight] of BOT_DIFFICULTY_WEIGHTS) {
    x -= Number(weight || 0);
    if (x <= 0) return difficulty;
  }
  return "normal";
}

function normalizeBotDifficulty(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "pro") return "hard";
  return BOT_DIFFICULTY_CONFIG[v] ? v : "normal";
}

function buildBotIdentity() {
  const name = randomFrom(PVP_BOT_NAME_POOL) || "Player";
  const nickname = name;
  const username = `bot_${crypto.randomBytes(6).toString("hex").slice(0, 10)}`;
  const botSkill = pickRandomBotDifficulty();
  return { username, nickname, botSkill };
}

async function ensureBotUsers() {
  if (!PVP_BOT_ENABLED) return;
  const { rows: botRows } = await pool.query(
    `SELECT id, nickname, bot_skill FROM users WHERE is_bot = true ORDER BY id ASC`
  );
  for (const row of botRows) {
    const botId = Number(row?.id);
    if (!Number.isInteger(botId)) continue;
    const rawSkill = String(row?.bot_skill || "").trim().toLowerCase();
    const hasValidSkill = rawSkill === "easy" || rawSkill === "normal" || rawSkill === "hard";
    const fixedSkill = hasValidSkill ? rawSkill : pickRandomBotDifficulty();
    if (rawSkill !== fixedSkill) {
      await pool.query(
        `UPDATE users
         SET bot_skill = $2
         WHERE id = $1 AND is_bot = true`,
        [botId, fixedSkill]
      );
    }
    const currentNickname = String(row?.nickname || "").trim();
    if (!/\d{3}$/.test(currentNickname)) continue;
    const candidates = [];
    const cleaned = currentNickname.replace(/\d{3}$/, "").trim();
    if (cleaned) candidates.push(cleaned);
    for (let i = 0; i < 40; i += 1) {
      candidates.push(buildBotIdentity().nickname);
    }
    let renamed = false;
    for (const nextNickname of candidates) {
      if (!nextNickname) continue;
      try {
        await pool.query(
          `UPDATE users
           SET nickname = $2
           WHERE id = $1 AND is_bot = true`,
          [botId, nextNickname]
        );
        renamed = true;
        break;
      } catch (err) {
        const msg = String(err.message || "");
        if (msg.includes("users_nickname_key")) continue;
        throw err;
      }
    }
    if (!renamed) {
      // keep existing nickname if no unique replacement was found
    }
  }
  const existingIds = botRows.map((r) => Number(r.id)).filter((v) => Number.isInteger(v));
  if (existingIds.length > PVP_BOT_POOL_MIN) {
    const deleteIds = existingIds.slice(PVP_BOT_POOL_MIN);
    if (deleteIds.length) {
      await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [deleteIds]);
    }
  }
  let needed = Math.max(0, PVP_BOT_POOL_MIN - Math.min(existingIds.length, PVP_BOT_POOL_MIN));
  while (needed > 0) {
    const identity = buildBotIdentity();
    const passwordHash = hashUserPassword(crypto.randomBytes(24).toString("hex"));
    const skill = normalizeBotDifficulty(identity.botSkill);
    try {
      await pool.query(
        `INSERT INTO users (
          username, nickname, password_hash, is_bot, bot_skill
        ) VALUES ($1, $2, $3, true, $4)`,
        [
          identity.username,
          identity.nickname,
          passwordHash,
          skill,
        ]
      );
      needed -= 1;
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("users_username_key") || msg.includes("users_nickname_key")) {
        continue;
      }
      throw err;
    }
  }
  await pool.query(
    `UPDATE users
     SET rating = $1,
         rating_games = 0,
         rating_wins = 0,
         rating_losses = 0
     WHERE is_bot = true`,
    [ELO_DEFAULT_RATING]
  );
}

function normalizeMaxPlayers(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return 2;
  return Math.max(2, Math.min(4, n));
}

function randomPvpSize() {
  return PVP_SIZE_OPTIONS[Math.floor(Math.random() * PVP_SIZE_OPTIONS.length)];
}

function pvpSizeKey(width, height) {
  return `${width}x${height}`;
}

function createPvpBotTicket(botUser, now = Date.now()) {
  const shortId = crypto.randomBytes(5).toString("hex");
  const userId = Number(botUser?.id);
  if (!Number.isInteger(userId)) return null;
  const nickname = String(botUser?.nickname || "").trim() || `Player${randomInt(100, 999)}`;
  const botSkill = normalizeBotDifficulty(botUser?.bot_skill);
  return {
    ticketId: `bot-ticket-${shortId}`,
    userId,
    username: String(botUser?.username || ""),
    nickname,
    botSkill,
    state: "bot",
    createdAt: now,
    updatedAt: now,
    matchId: null,
    roomCode: null,
    playerId: null,
    cancelReason: null,
    isBot: true,
  };
}

async function fetchAvailablePvpBotTicket(now = Date.now()) {
  if (!PVP_BOT_ENABLED) return null;
  const { rows } = await pool.query(
    `SELECT id, username, nickname, bot_skill
     FROM users
     WHERE is_bot = true
     ORDER BY id ASC
     LIMIT $1`,
    [PVP_BOT_POOL_MIN]
  );
  if (!rows.length) return null;

  const isBotBusyInMatch = (botUserId) => {
    for (const match of pvpMatches.values()) {
      if (!match || match.state === "cancelled") continue;
      if (Array.isArray(match.players) && match.players.some((p) => Number(p.userId) === Number(botUserId))) {
        return true;
      }
    }
    return false;
  };

  for (const row of rows) {
    const botId = Number(row.id);
    if (!Number.isInteger(botId)) continue;
    if (isUserInAnyRoom(botId)) continue;
    if (isBotBusyInMatch(botId)) continue;
    const ticket = createPvpBotTicket(row, now);
    if (ticket) return ticket;
  }
  return null;
}

function pickBotTargetSec(width, height, rawDifficulty = "normal") {
  const difficulty = normalizeBotDifficulty(rawDifficulty);
  const key = `${width}x${height}`;
  const bySize = BOT_SOLVE_TIME_RANGE_SEC[key];
  if (bySize && Array.isArray(bySize[difficulty]) && bySize[difficulty].length === 2) {
    const [minSec, maxSec] = bySize[difficulty];
    return randomInt(Number(minSec), Number(maxSec));
  }
  if (bySize && Array.isArray(bySize.normal) && bySize.normal.length === 2) {
    const [minSec, maxSec] = bySize.normal;
    return randomInt(Number(minSec), Number(maxSec));
  }
  return randomInt(120, 420);
}

function eloExpected(myRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - myRating) / 400));
}

function eloKFactor(games) {
  const n = Number(games || 0);
  return n < ELO_PLACEMENT_GAMES ? ELO_K_PLACEMENT : ELO_K_NORMAL;
}

function eloNextRating(currentRating, expected, score, k) {
  const base = Number.isFinite(Number(currentRating)) ? Number(currentRating) : ELO_DEFAULT_RATING;
  return Math.max(100, Math.min(4000, Math.round(base + k * (score - expected))));
}

function isUserInAnyRoom(userId) {
  if (!userId) return false;
  for (const room of raceRooms.values()) {
    for (const p of room.players.values()) {
      if (p.userId === userId && !p.disconnectedAt) return true;
    }
  }
  return false;
}

function removePvpTicket(ticketId) {
  const id = String(ticketId || "");
  if (!id) return;
  const ticket = pvpQueueTickets.get(id);
  if (ticket) {
    pvpUserTicket.delete(ticket.userId);
    pvpQueueTickets.delete(id);
  }
  const idx = pvpWaitingOrder.indexOf(id);
  if (idx >= 0) pvpWaitingOrder.splice(idx, 1);
}

async function fetchRandomPuzzleForSize(width, height) {
  const { rows } = await pool.query(
    `SELECT id, width, height, row_hints, col_hints, is_unique, solution_bits
     FROM puzzles
     WHERE width = $1 AND height = $2 AND solution_bits IS NOT NULL
     ORDER BY random()
     LIMIT 1`,
    [width, height]
  );
  if (!rows.length) return null;
  return rows[0];
}

function puzzleClientView(puzzle) {
  return {
    id: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    row_hints: puzzle.row_hints,
    col_hints: puzzle.col_hints,
    is_unique: puzzle.is_unique,
  };
}

function getPvpMatchPlayer(match, userId) {
  if (!match || !userId) return null;
  return match.players.find((p) => p.userId === userId) || null;
}

function buildPvpMatchPublicState(match, viewerUserId) {
  const me = getPvpMatchPlayer(match, viewerUserId);
  return {
    matchId: match.matchId,
    state: match.state,
    cancelReason: match.cancelReason || null,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    acceptDeadlineAt: match.acceptDeadlineAt || null,
    banDeadlineAt: match.banDeadlineAt || null,
    revealStartAt: match.revealStartAt || null,
    revealEndAt: match.revealEndAt || null,
    chosenSizeKey: match.chosenSizeKey || null,
    chosenWidth: match.chosenWidth || null,
    chosenHeight: match.chosenHeight || null,
    roomCode: match.roomCode || null,
    players: match.players.map((p) => ({
      userId: p.userId,
      nickname: p.nickname,
      accepted: p.accepted === true,
      acceptedAt: p.acceptedAt || null,
      banSubmitted: p.banSubmitted === true,
      bannedSizeKey: p.bannedSizeKey || null,
      playerId: p.playerId || null,
    })),
    options: match.options.map((o) => ({
      sizeKey: o.sizeKey,
      width: o.width,
      height: o.height,
      banned: Array.isArray(o.bannedByUserIds) && o.bannedByUserIds.length > 0,
      bannedByUserIds: Array.isArray(o.bannedByUserIds) ? o.bannedByUserIds : [],
      bannedByNicknames: Array.isArray(o.bannedByNicknames) ? o.bannedByNicknames : [],
    })),
    me: me
      ? {
          userId: me.userId,
          accepted: me.accepted === true,
          banSubmitted: me.banSubmitted === true,
          bannedSizeKey: me.bannedSizeKey || null,
          playerId: me.playerId || null,
        }
      : null,
  };
}

function cancelPvpMatch(match, reason = "cancelled", actorUserId = null) {
  if (!match || match.state === "cancelled" || match.state === "ready") return;
  const now = Date.now();
  match.state = "cancelled";
  match.cancelReason = reason;
  match.cancelledByUserId = actorUserId || null;
  match.updatedAt = now;

  for (const p of match.players) {
    const ticket = pvpQueueTickets.get(p.ticketId);
    if (!ticket) continue;
    ticket.state = "cancelled";
    ticket.cancelReason = reason;
    ticket.updatedAt = now;
  }
}

function finalizePvpBans(match) {
  for (const option of match.options) {
    option.bannedByUserIds = [];
    option.bannedByNicknames = [];
  }

  for (const p of match.players) {
    if (!p.bannedSizeKey) continue;
    const option = match.options.find((o) => o.sizeKey === p.bannedSizeKey);
    if (!option) continue;
    if (!option.bannedByUserIds.includes(p.userId)) option.bannedByUserIds.push(p.userId);
    if (!option.bannedByNicknames.includes(p.nickname)) option.bannedByNicknames.push(p.nickname);
  }

  const available = match.options.filter((o) => !o.bannedByUserIds.length);
  const pool = available.length ? available : match.options;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  match.chosenSizeKey = chosen.sizeKey;
  match.chosenWidth = chosen.width;
  match.chosenHeight = chosen.height;
  match.state = "reveal";
  match.revealStartAt = Date.now();
  match.revealEndAt = match.revealStartAt + PVP_REVEAL_MS;
  match.updatedAt = Date.now();
}

function runBotActionsForMatch(match, now = Date.now()) {
  if (!match) return;
  for (const player of match.players) {
    if (!player.isBot) continue;
    if (match.state === "accept" && !player.accepted) {
      if (!player.botAcceptAt) {
        const conf = BOT_DIFFICULTY_CONFIG[normalizeBotDifficulty(player.botDifficulty)] || BOT_DIFFICULTY_CONFIG.normal;
        player.botAcceptAt = now + randomInt(conf.acceptMin, conf.acceptMax);
      }
      if (now < player.botAcceptAt) continue;
      player.accepted = true;
      player.acceptedAt = now;
      match.updatedAt = now;
      continue;
    }
    if (match.state === "ban" && !player.banSubmitted) {
      const conf = BOT_DIFFICULTY_CONFIG[normalizeBotDifficulty(player.botDifficulty)] || BOT_DIFFICULTY_CONFIG.normal;
      if (!player.botBanAt) {
        player.botBanAt = now + randomInt(conf.banMin, conf.banMax);
      }
      if (now < player.botBanAt) continue;
      const shouldSkip = Math.random() < conf.skipBanRate;
      if (!shouldSkip && Array.isArray(match.options) && match.options.length > 0) {
        const pick = match.options[Math.floor(Math.random() * match.options.length)];
        player.bannedSizeKey = pick?.sizeKey || null;
      } else {
        player.bannedSizeKey = null;
      }
      player.banSubmitted = true;
      player.banSubmittedAt = now;
      match.updatedAt = now;
    }
  }
}

async function createPvpRoomForMatch(match) {
  if (!match || match.roomCode) return;
  if (!match.chosenWidth || !match.chosenHeight) {
    cancelPvpMatch(match, "invalid_selected_size");
    return;
  }

  const puzzle = await fetchRandomPuzzleForSize(match.chosenWidth, match.chosenHeight);
  if (!puzzle) {
    cancelPvpMatch(match, "no_puzzle_for_selected_size");
    return;
  }

  let solutionBits = toSolutionBits(puzzle.solution_bits);
  if (!solutionBits) {
    solutionBits = await loadSolutionBitsHexById(puzzle.id);
  }
  if (!solutionBits) {
    cancelPvpMatch(match, "puzzle_solution_missing");
    return;
  }

  const roomCode = makeRoomCode();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const playerIdByUserId = new Map();
  const hasBot = match.players.some((p) => p.isBot === true);

  const room = {
    roomCode,
    roomTitle: "PvP Match",
    mode: hasBot ? "pvp_bot" : "pvp_ranked",
    visibility: "public",
    passwordHash: null,
    puzzleId: puzzle.id,
    solutionBits,
    totalAnswerCells: popcountBuffer(solutionBits),
    maxPlayers: 2,
    finishTarget: 1,
    width: puzzle.width,
    height: puzzle.height,
    createdAt: now,
    hostPlayerId: null,
    state: "countdown",
    countdownStartAt: now,
    gameStartAt: now + COUNTDOWN_MS,
    winnerPlayerId: null,
    ratedUserIds: match.players.map((p) => Number(p.userId)).filter((v) => Number.isInteger(v)),
    ratedResultApplied: false,
    ratedResultApplying: false,
    ratedResult: null,
    chatMessages: [],
    reactionEvents: [],
    players: new Map(),
  };

  for (const p of match.players) {
    const playerId = randomPlayerId();
    playerIdByUserId.set(p.userId, playerId);
    room.players.set(playerId, {
      playerId,
      userId: p.userId,
      nickname: p.nickname,
      isBot: p.isBot === true,
      botDifficulty: p.isBot ? normalizeBotDifficulty(p.botDifficulty) : null,
      botTargetSec: p.isBot ? pickBotTargetSec(puzzle.width, puzzle.height, p.botDifficulty) : null,
      joinedAt: nowIso,
      finishedAt: null,
      elapsedSec: null,
      isReady: true,
      disconnectedAt: null,
      correctAnswerCells: 0,
      lastSeenAt: now,
    });
  }

  const first = match.players[0];
  room.hostPlayerId = first ? playerIdByUserId.get(first.userId) : randomPlayerId();
  raceRooms.set(roomCode, room);

  match.roomCode = roomCode;
  match.puzzleId = puzzle.id;
  match.state = "ready";
  match.updatedAt = Date.now();
  match.puzzlePreview = puzzleClientView(puzzle);

  for (const p of match.players) {
    p.playerId = playerIdByUserId.get(p.userId) || null;
    const ticket = pvpQueueTickets.get(p.ticketId);
    if (!ticket) continue;
    ticket.state = "matched";
    ticket.roomCode = roomCode;
    ticket.playerId = p.playerId;
    ticket.updatedAt = Date.now();
  }
}

async function syncPvpMatchState(match) {
  if (!match) return;
  const now = Date.now();

  if (match.state === "accept") {
    runBotActionsForMatch(match, now);
    const allAccepted = match.players.every((p) => p.accepted === true);
    if (allAccepted) {
      match.state = "ban";
      match.banDeadlineAt = now + PVP_BAN_MS;
      match.updatedAt = now;
    } else if (now >= match.acceptDeadlineAt) {
      cancelPvpMatch(match, "accept_timeout");
    }
  }

  if (match.state === "ban") {
    runBotActionsForMatch(match, now);
    const allSubmitted = match.players.every((p) => p.banSubmitted === true);
    if (allSubmitted || now >= match.banDeadlineAt) {
      finalizePvpBans(match);
    }
  }

  if (match.state === "reveal" && now >= match.revealEndAt) {
    await createPvpRoomForMatch(match);
  }
}

function cleanupPvpQueue(now = Date.now()) {
  for (const [matchId, match] of pvpMatches.entries()) {
    if (match.state === "accept" && now >= match.acceptDeadlineAt) {
      const allAccepted = match.players.every((p) => p.accepted === true);
      if (!allAccepted) cancelPvpMatch(match, "accept_timeout");
    }
    if (match.state === "cancelled" && now - Number(match.updatedAt || now) > PVP_MATCH_TICKET_TTL_MS) {
      pvpMatches.delete(matchId);
      continue;
    }
    if (match.state === "ready" && now - Number(match.updatedAt || now) > PVP_MATCH_TICKET_TTL_MS) {
      pvpMatches.delete(matchId);
    }
  }

  for (const [ticketId, ticket] of pvpQueueTickets.entries()) {
    const age = now - Number(ticket.updatedAt || ticket.createdAt || now);
    if (ticket.state === "waiting" && age > PVP_QUEUE_STALE_MS) {
      removePvpTicket(ticketId);
      continue;
    }
    if (ticket.state === "matching") {
      const match = pvpMatches.get(ticket.matchId);
      if (!match) {
        removePvpTicket(ticketId);
        continue;
      }
      if (match.state === "cancelled") {
        ticket.state = "cancelled";
        ticket.cancelReason = match.cancelReason || "cancelled";
        ticket.updatedAt = now;
      }
      continue;
    }
    if ((ticket.state === "matched" || ticket.state === "cancelled") && age > PVP_MATCH_TICKET_TTL_MS) {
      removePvpTicket(ticketId);
    }
  }
}

function syncRoomState(room) {
  if (room.state === "countdown" && room.gameStartAt && Date.now() >= room.gameStartAt) {
    room.state = "playing";
  }
}

function advanceBotPlayers(room, now = Date.now()) {
  if (!room || room.state !== "playing") return false;
  const gameStartAt = Number(room.gameStartAt || now);
  let changed = false;
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    p.lastSeenAt = now;
    if (p.disconnectedAt || Number.isInteger(p.elapsedSec)) continue;
    const targetSec = Number(p.botTargetSec || pickBotTargetSec(room.width, room.height, p.botDifficulty));
    if (!p.botTargetSec) p.botTargetSec = targetSec;
    const elapsedSec = Math.max(0, Math.floor((now - gameStartAt) / 1000));
    const clamped = Math.min(targetSec, elapsedSec);
    const progress = Math.min(1, clamped / targetSec);
    const nextCorrect = Math.max(
      Number(p.correctAnswerCells || 0),
      Math.min(Number(room.totalAnswerCells || 0), Math.floor((room.totalAnswerCells || 0) * progress))
    );
    if (nextCorrect !== Number(p.correctAnswerCells || 0)) {
      p.correctAnswerCells = nextCorrect;
      changed = true;
    }
    if (progress >= 1) {
      p.elapsedSec = targetSec;
      p.finishedAt = new Date(gameStartAt + targetSec * 1000).toISOString();
      p.correctAnswerCells = room.totalAnswerCells || 0;
      changed = true;
    }
  }
  if (room.state === "playing" && shouldFinishRace(room)) {
    const finished = getFinishedPlayers(room);
    if (!room.winnerPlayerId && finished.length > 0) {
      room.winnerPlayerId = finished[0].playerId;
    }
    room.state = "finished";
    void applyRatedResultIfNeeded(room);
    changed = true;
  }
  return changed;
}

function touchPlayer(room, playerId) {
  if (!room || !playerId) return null;
  const player = room.players.get(playerId);
  if (!player) return null;
  player.lastSeenAt = Date.now();
  return player;
}

function removeStalePlayers(room, now = Date.now()) {
  let changed = false;

  for (const [playerId, p] of room.players.entries()) {
    if (p.isBot) {
      p.lastSeenAt = now;
      continue;
    }
    let lastSeenAt = Number(p.lastSeenAt || 0);
    if (!lastSeenAt) {
      const joinedAtMs = Date.parse(p.joinedAt || "") || room.createdAt || now;
      lastSeenAt = joinedAtMs;
      p.lastSeenAt = joinedAtMs;
    }
    if (now - lastSeenAt <= PLAYER_STALE_MS) continue;

    if (room.state === "lobby") {
      room.players.delete(playerId);
      changed = true;
      if (room.hostPlayerId === playerId && room.players.size > 0) {
        const nextHost = Array.from(room.players.values()).sort((a, b) =>
          a.joinedAt > b.joinedAt ? 1 : -1
        )[0];
        room.hostPlayerId = nextHost.playerId;
      }
    } else {
      if (!p.disconnectedAt) p.disconnectedAt = new Date(now).toISOString();
      p.isReady = false;
      changed = true;
    }
  }

  if (room.players.size === 0) return { changed: true, deleteRoom: true };

  if (room.state === "playing" && shouldFinishRace(room)) {
    const finished = getFinishedPlayers(room);
    if (!room.winnerPlayerId && finished.length > 0) {
      room.winnerPlayerId = finished[0].playerId;
    }
    room.state = "finished";
    void applyRatedResultIfNeeded(room);
    changed = true;
  }

  return { changed, deleteRoom: false };
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

async function applyRatedResultIfNeeded(room) {
  if (!room || room.state !== "finished") return;
  if (room.mode !== "pvp_ranked" && room.mode !== "pvp_bot") return;
  if (room.ratedResultApplied === true || room.ratedResultApplying === true) return;
  if (!Array.isArray(room.ratedUserIds) || room.ratedUserIds.length !== 2) return;

  const [userA, userB] = room.ratedUserIds.map((v) => Number(v)).filter((v) => Number.isInteger(v));
  if (!Number.isInteger(userA) || !Number.isInteger(userB) || userA === userB) return;

  const winnerPlayer =
    (room.winnerPlayerId && room.players.get(room.winnerPlayerId)) || getFinishedPlayers(room)[0] || null;
  if (!winnerPlayer || !Number.isInteger(Number(winnerPlayer.userId))) return;

  const winnerUserId = Number(winnerPlayer.userId);
  const loserUserId = winnerUserId === userA ? userB : winnerUserId === userB ? userA : null;
  if (!loserUserId) return;

  room.ratedResultApplying = true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, rating, rating_games, rating_wins, rating_losses
       FROM users
       WHERE id = ANY($1::bigint[])`,
      [[winnerUserId, loserUserId]]
    );
    if (rows.length !== 2) {
      await client.query("ROLLBACK");
      return;
    }
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const winner = byId.get(winnerUserId);
    const loser = byId.get(loserUserId);
    if (!winner || !loser) {
      await client.query("ROLLBACK");
      return;
    }

    const expectedWinner = eloExpected(Number(winner.rating), Number(loser.rating));
    const expectedLoser = eloExpected(Number(loser.rating), Number(winner.rating));
    const winnerK = eloKFactor(Number(winner.rating_games));
    const loserK = eloKFactor(Number(loser.rating_games));
    const winnerNext = eloNextRating(Number(winner.rating), expectedWinner, 1, winnerK);
    const loserNext = eloNextRating(Number(loser.rating), expectedLoser, 0, loserK);

    await client.query(
      `UPDATE users
       SET rating = $2,
           rating_games = rating_games + 1,
           rating_wins = rating_wins + 1
       WHERE id = $1`,
      [winnerUserId, winnerNext]
    );
    await client.query(
      `UPDATE users
       SET rating = $2,
           rating_games = rating_games + 1,
           rating_losses = rating_losses + 1
       WHERE id = $1`,
      [loserUserId, loserNext]
    );
    await client.query("COMMIT");

    room.ratedResultApplied = true;
    room.ratedResult = {
      winnerUserId,
      loserUserId,
      winnerDelta: winnerNext - Number(winner.rating),
      loserDelta: loserNext - Number(loser.rating),
      appliedAt: Date.now(),
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
  } finally {
    room.ratedResultApplying = false;
    client.release();
  }
}

function roomPublicState(room) {
  syncRoomState(room);
  advanceBotPlayers(room, Date.now());
  removeStalePlayers(room, Date.now());
  void applyRatedResultIfNeeded(room);
  const now = Date.now();
  if (!Array.isArray(room.reactionEvents)) {
    room.reactionEvents = [];
  } else {
    room.reactionEvents = room.reactionEvents.filter((e) => now - e.ts <= 6000);
  }
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
    chatMessages: Array.isArray(room.chatMessages) ? room.chatMessages : [],
    reactionEvents: room.reactionEvents,
    winner,
    isFinished: room.state === "finished",
    serverNow: Date.now(),
  };
}

function roomListItem(room) {
  syncRoomState(room);
  removeStalePlayers(room, Date.now());
  const activeCount = Array.from(room.players.values()).filter((p) => !p.disconnectedAt).length;
  return {
    roomCode: room.roomCode,
    roomTitle: room.roomTitle,
    visibility: room.visibility,
    isPrivate: room.visibility === "private",
    width: room.width,
    height: room.height,
    maxPlayers: room.maxPlayers,
    currentPlayers: activeCount,
    state: room.state,
    createdAt: room.createdAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of raceRooms.entries()) {
    syncRoomState(room);
    const stale = removeStalePlayers(room, now);
    if (stale.deleteRoom) {
      raceRooms.delete(code);
      continue;
    }
    if (now - room.createdAt > ROOM_TTL_MS) {
      raceRooms.delete(code);
    }
  }
}, 1000 * 60 * 15);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of raceRooms.entries()) {
    const stale = removeStalePlayers(room, now);
    if (stale.deleteRoom) {
      raceRooms.delete(code);
    }
  }
}, 1000 * 10);

setInterval(async () => {
  const now = Date.now();
  for (const match of pvpMatches.values()) {
    try {
      await syncPvpMatchState(match);
    } catch {
      // ignore pvp transition errors
    }
  }
  cleanupPvpQueue(now);
  await maybeMatchWaitingTicketsWithBot(now);
  for (const room of raceRooms.values()) {
    syncRoomState(room);
    advanceBotPlayers(room, now);
  }
}, 1000);

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
       RETURNING id, username, nickname, rating, rating_games, rating_wins, rating_losses`,
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
      `SELECT id, username, nickname, password_hash, rating, rating_games, rating_wins, rating_losses
       FROM users
       WHERE username = $1
         AND is_bot = false
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
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        rating: user.rating,
        rating_games: user.rating_games,
        rating_wins: user.rating_wins,
        rating_losses: user.rating_losses,
      },
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
      rating: req.authUser.rating,
      rating_games: req.authUser.rating_games,
      rating_wins: req.authUser.rating_wins,
      rating_losses: req.authUser.rating_losses,
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

app.get("/ratings/leaderboard", async (req, res) => {
  const limitRaw = Number(req.query?.limit);
  const offsetRaw = Number(req.query?.offset);
  const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;
  const offset = Number.isInteger(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  try {
    const { rows } = await pool.query(
      `SELECT id, username, nickname, is_bot, rating, rating_games, rating_wins, rating_losses
       FROM users
       ORDER BY rating DESC, rating_wins DESC, rating_games DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.json({ ok: true, users: rows });
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

async function buildPvpReadyPayload(ticket) {
  if (!ticket || !ticket.roomCode || !ticket.playerId) return null;
  const room = raceRooms.get(ticket.roomCode);
  if (!room) return null;
  const roomPlayer = room.players.get(ticket.playerId);
  if (!roomPlayer) return null;
  touchPlayer(room, ticket.playerId);

  const { rows } = await pool.query(
    `SELECT id, width, height, row_hints, col_hints, is_unique
     FROM puzzles
     WHERE id = $1`,
    [room.puzzleId]
  );
  if (!rows.length) return null;
  return {
    matched: true,
    state: "ready",
    roomCode: ticket.roomCode,
    playerId: ticket.playerId,
    puzzle: rows[0],
    room: roomPublicState(room),
  };
}

async function buildPvpStatusPayload(ticket, viewerUserId) {
  if (!ticket) return null;
  const base = {
    ok: true,
    ticketId: ticket.ticketId,
    queueSize: getVisiblePvpQueueSize(),
  };

  if (ticket.state === "waiting") {
    return {
      ...base,
      state: "waiting",
      matched: false,
    };
  }

  if (ticket.state === "matched" && ticket.roomCode && ticket.playerId) {
    const ready = await buildPvpReadyPayload(ticket);
    if (!ready) {
      removePvpTicket(ticket.ticketId);
      return null;
    }
    return {
      ...base,
      ...ready,
    };
  }

  if (ticket.state === "matching" && ticket.matchId) {
    const match = pvpMatches.get(ticket.matchId);
    if (!match) {
      removePvpTicket(ticket.ticketId);
      return null;
    }

    await syncPvpMatchState(match);

    if (match.state === "ready") {
      const ready = await buildPvpReadyPayload(ticket);
      if (!ready) {
        removePvpTicket(ticket.ticketId);
        return null;
      }
      return {
        ...base,
        ...ready,
        match: buildPvpMatchPublicState(match, viewerUserId),
      };
    }

    if (match.state === "cancelled") {
      ticket.state = "cancelled";
      ticket.cancelReason = match.cancelReason || "cancelled";
      ticket.updatedAt = Date.now();
      return {
        ...base,
        state: "cancelled",
        matched: false,
        cancelReason: ticket.cancelReason,
        match: buildPvpMatchPublicState(match, viewerUserId),
      };
    }

    return {
      ...base,
      state: "matching",
      matched: false,
      match: buildPvpMatchPublicState(match, viewerUserId),
    };
  }

  if (ticket.state === "cancelled") {
    return {
      ...base,
      state: "cancelled",
      matched: false,
      cancelReason: ticket.cancelReason || "cancelled",
    };
  }

  return {
    ...base,
    state: "waiting",
    matched: false,
  };
}

function findPvpOpponent(myUserId) {
  while (pvpWaitingOrder.length > 0) {
    const candidateId = pvpWaitingOrder.shift();
    const candidate = pvpQueueTickets.get(candidateId);
    if (!candidate) continue;
    if (candidate.userId === myUserId) continue;
    if (candidate.state !== "waiting") continue;
    if (Date.now() - Number(candidate.updatedAt || candidate.createdAt || Date.now()) > PVP_QUEUE_STALE_MS) {
      removePvpTicket(candidateId);
      continue;
    }
    if (isUserInAnyRoom(candidate.userId)) {
      removePvpTicket(candidateId);
      continue;
    }
    return candidate;
  }
  return null;
}

function createPvpMatch(ticketA, ticketB) {
  const now = Date.now();
  const matchId = randomPlayerId();
  const players = [ticketA, ticketB].map((ticket) => {
    const isBot = ticket?.isBot === true;
    const botDifficulty = isBot ? normalizeBotDifficulty(ticket?.botSkill) : null;
    const botConf = isBot
      ? BOT_DIFFICULTY_CONFIG[normalizeBotDifficulty(botDifficulty)] || BOT_DIFFICULTY_CONFIG.normal
      : null;
    return {
      userId: ticket.userId,
      nickname: ticket.nickname,
      ticketId: ticket.ticketId,
      isBot,
      botDifficulty,
      botAcceptAt: isBot ? now + randomInt(botConf.acceptMin, botConf.acceptMax) : null,
      botBanAt: null,
      accepted: false,
      acceptedAt: null,
      banSubmitted: false,
      bannedSizeKey: null,
      banSubmittedAt: null,
      playerId: null,
    };
  });
  const match = {
    matchId,
    state: "accept",
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    acceptDeadlineAt: now + PVP_ACCEPT_MS,
    banDeadlineAt: null,
    revealStartAt: null,
    revealEndAt: null,
    chosenSizeKey: null,
    chosenWidth: null,
    chosenHeight: null,
    roomCode: null,
    puzzleId: null,
    puzzlePreview: null,
    players,
    options: PVP_SIZE_OPTIONS.map(([width, height]) => ({
      sizeKey: pvpSizeKey(width, height),
      width,
      height,
      bannedByUserIds: [],
      bannedByNicknames: [],
    })),
  };

  pvpMatches.set(matchId, match);

  if (!ticketA.isBot) {
    ticketA.state = "matching";
    ticketA.matchId = matchId;
    ticketA.cancelReason = null;
    ticketA.updatedAt = now;
  }
  if (!ticketB.isBot) {
    ticketB.state = "matching";
    ticketB.matchId = matchId;
    ticketB.cancelReason = null;
    ticketB.updatedAt = now;
  }

  return match;
}

async function maybeMatchWaitingTicketsWithBot(now = Date.now()) {
  if (!PVP_BOT_ENABLED) return;
  const candidates = [...pvpWaitingOrder];
  for (const ticketId of candidates) {
    const ticket = pvpQueueTickets.get(ticketId);
    if (!ticket) continue;
    if (ticket.state !== "waiting") continue;
    if (isUserInAnyRoom(ticket.userId)) {
      removePvpTicket(ticketId);
      continue;
    }
    const waitedMs = now - Number(ticket.createdAt || now);
    if (waitedMs < PVP_BOT_WAIT_MS) continue;
    const idx = pvpWaitingOrder.indexOf(ticketId);
    if (idx >= 0) pvpWaitingOrder.splice(idx, 1);
    const botTicket = await fetchAvailablePvpBotTicket(now);
    if (!botTicket) {
      pvpWaitingOrder.push(ticketId);
      continue;
    }
    createPvpMatch(ticket, botTicket);
  }
}

app.post("/pvp/queue/join", requireAuth, async (req, res) => {
  cleanupPvpQueue(Date.now());

  if (isUserInAnyRoom(req.authUser.id)) {
    return res.status(400).json({ ok: false, error: "You are already in a room" });
  }

  const now = Date.now();
  const existingTicketId = pvpUserTicket.get(req.authUser.id);
  if (existingTicketId) {
    const existing = pvpQueueTickets.get(existingTicketId);
    if (existing) {
      existing.updatedAt = now;
      const payload = await buildPvpStatusPayload(existing, req.authUser.id);
      if (!payload) {
        removePvpTicket(existingTicketId);
      } else if (payload.state === "cancelled") {
        removePvpTicket(existingTicketId);
      } else {
        return res.json(payload);
      }
    } else {
      pvpUserTicket.delete(req.authUser.id);
    }
  }

  const myTicketId = randomPlayerId();
  const myTicket = {
    ticketId: myTicketId,
    userId: req.authUser.id,
    nickname: req.authUser.nickname,
    state: "waiting",
    createdAt: now,
    updatedAt: now,
    matchId: null,
    roomCode: null,
    playerId: null,
    cancelReason: null,
  };
  pvpQueueTickets.set(myTicketId, myTicket);
  pvpUserTicket.set(req.authUser.id, myTicketId);

  const opponent = findPvpOpponent(req.authUser.id);
  if (!opponent) {
    pvpWaitingOrder.push(myTicketId);
    return res.json({
      ok: true,
      ticketId: myTicketId,
      state: "waiting",
      matched: false,
      queueSize: getVisiblePvpQueueSize(),
    });
  }

  const match = createPvpMatch(myTicket, opponent);
  return res.json({
    ok: true,
    ticketId: myTicketId,
    state: "matching",
    matched: false,
    queueSize: getVisiblePvpQueueSize(),
    match: buildPvpMatchPublicState(match, req.authUser.id),
  });
});

app.get("/pvp/queue/status", requireAuth, async (req, res) => {
  cleanupPvpQueue(Date.now());
  const ticketId = String(req.query?.ticketId || "").trim();
  if (!ticketId) return res.status(400).json({ ok: false, error: "ticketId is required" });
  const ticket = pvpQueueTickets.get(ticketId);
  if (!ticket || ticket.userId !== req.authUser.id) {
    return res.status(404).json({ ok: false, error: "Match ticket not found" });
  }
  ticket.updatedAt = Date.now();

  const payload = await buildPvpStatusPayload(ticket, req.authUser.id);
  if (!payload) {
    return res.status(404).json({ ok: false, error: "Match ticket expired" });
  }
  return res.json(payload);
});

app.post("/pvp/queue/cancel", (req, res) => {
  const ticketId = String(req.body?.ticketId || "").trim();
  if (!ticketId) return res.status(400).json({ ok: false, error: "ticketId is required" });
  const ticket = pvpQueueTickets.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, error: "Match ticket not found" });
  }
  if (ticket.state === "matching" && ticket.matchId) {
    const match = pvpMatches.get(ticket.matchId);
    if (match && match.state !== "ready" && match.state !== "cancelled") {
      cancelPvpMatch(match, "cancelled_by_user", ticket.userId);
    }
  }
  removePvpTicket(ticketId);
  return res.json({ ok: true, cancelled: true });
});

app.post("/pvp/match/accept", requireAuth, async (req, res) => {
  cleanupPvpQueue(Date.now());
  const ticketId = String(req.body?.ticketId || "").trim();
  if (!ticketId) return res.status(400).json({ ok: false, error: "ticketId is required" });
  const ticket = pvpQueueTickets.get(ticketId);
  if (!ticket || ticket.userId !== req.authUser.id) {
    return res.status(404).json({ ok: false, error: "Match ticket not found" });
  }
  if (ticket.state !== "matching" || !ticket.matchId) {
    const payload = await buildPvpStatusPayload(ticket, req.authUser.id);
    if (!payload) return res.status(404).json({ ok: false, error: "Match ticket expired" });
    return res.json(payload);
  }
  const match = pvpMatches.get(ticket.matchId);
  if (!match) {
    removePvpTicket(ticketId);
    return res.status(404).json({ ok: false, error: "Match not found" });
  }

  await syncPvpMatchState(match);
  if (match.state === "accept") {
    const player = getPvpMatchPlayer(match, req.authUser.id);
    if (!player) return res.status(403).json({ ok: false, error: "Not a match participant" });
    player.accepted = true;
    player.acceptedAt = Date.now();
    match.updatedAt = Date.now();
    await syncPvpMatchState(match);
  }

  const payload = await buildPvpStatusPayload(ticket, req.authUser.id);
  if (!payload) return res.status(404).json({ ok: false, error: "Match ticket expired" });
  return res.json(payload);
});

app.post("/pvp/match/ban", requireAuth, async (req, res) => {
  cleanupPvpQueue(Date.now());
  const ticketId = String(req.body?.ticketId || "").trim();
  if (!ticketId) return res.status(400).json({ ok: false, error: "ticketId is required" });
  const ticket = pvpQueueTickets.get(ticketId);
  if (!ticket || ticket.userId !== req.authUser.id) {
    return res.status(404).json({ ok: false, error: "Match ticket not found" });
  }
  if (ticket.state !== "matching" || !ticket.matchId) {
    const payload = await buildPvpStatusPayload(ticket, req.authUser.id);
    if (!payload) return res.status(404).json({ ok: false, error: "Match ticket expired" });
    return res.json(payload);
  }
  const match = pvpMatches.get(ticket.matchId);
  if (!match) {
    removePvpTicket(ticketId);
    return res.status(404).json({ ok: false, error: "Match not found" });
  }

  await syncPvpMatchState(match);
  if (match.state === "ban") {
    const player = getPvpMatchPlayer(match, req.authUser.id);
    if (!player) return res.status(403).json({ ok: false, error: "Not a match participant" });
    if (!player.banSubmitted) {
      const skip = req.body?.skip === true;
      const sizeKey = String(req.body?.sizeKey || "").trim();
      if (!skip && sizeKey) {
        const option = match.options.find((o) => o.sizeKey === sizeKey);
        if (!option) {
          return res.status(400).json({ ok: false, error: "Invalid sizeKey" });
        }
        player.bannedSizeKey = sizeKey;
      } else {
        player.bannedSizeKey = null;
      }
      player.banSubmitted = true;
      player.banSubmittedAt = Date.now();
      match.updatedAt = Date.now();
      await syncPvpMatchState(match);
    }
  }

  const payload = await buildPvpStatusPayload(ticket, req.authUser.id);
  if (!payload) return res.status(404).json({ ok: false, error: "Match ticket expired" });
  return res.json(payload);
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
      chatMessages: [],
      reactionEvents: [],
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
      lastSeenAt: Date.now(),
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
      lastSeenAt: Date.now(),
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
  touchPlayer(room, playerId);
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
  touchPlayer(room, playerId);
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
    p.lastSeenAt = now;
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
  touchPlayer(room, playerId);
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
  touchPlayer(room, playerId);
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
    room.reactionEvents = [];
    room.finishTarget = Math.max(1, room.players.size - 1);
    for (const p of room.players.values()) {
      p.isReady = false;
      p.finishedAt = null;
      p.elapsedSec = null;
      p.disconnectedAt = null;
      p.correctAnswerCells = 0;
      p.lastSeenAt = Date.now();
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
  const playerId = String(req.query?.playerId || "").trim();
  if (playerId) touchPlayer(room, playerId);
  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/chat", requireAuth, (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  const text = normalizeChatText(req.body?.text);
  if (!roomCode || !playerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId are required" });
  }
  if (!text) {
    return res.status(400).json({ ok: false, error: "text is required" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  const player = room.players.get(playerId);
  if (!player) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }
  touchPlayer(room, playerId);
  if (player.userId !== req.authUser.id) {
    return res.status(403).json({ ok: false, error: "Forbidden player" });
  }
  if (player.disconnectedAt) {
    return res.status(400).json({ ok: false, error: "Disconnected player cannot chat" });
  }

  if (!Array.isArray(room.chatMessages)) {
    room.chatMessages = [];
  }
  room.chatMessages.push({
    id: crypto.randomBytes(8).toString("hex"),
    playerId: player.playerId,
    nickname: player.nickname,
    text,
    createdAt: new Date().toISOString(),
  });
  if (room.chatMessages.length > 120) {
    room.chatMessages = room.chatMessages.slice(-120);
  }
  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/reaction", requireAuth, (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const playerId = String(req.body?.playerId || "").trim();
  const targetPlayerId = String(req.body?.targetPlayerId || "").trim();
  const emoji = normalizeReactionEmoji(req.body?.emoji);
  if (!roomCode || !playerId || !targetPlayerId) {
    return res.status(400).json({ ok: false, error: "roomCode/playerId/targetPlayerId are required" });
  }
  if (!emoji) {
    return res.status(400).json({ ok: false, error: "Invalid emoji" });
  }
  const room = raceRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: "Room not found" });
  }
  const sender = room.players.get(playerId);
  const target = room.players.get(targetPlayerId);
  if (!sender || !target) {
    return res.status(404).json({ ok: false, error: "Player not found in room" });
  }
  touchPlayer(room, playerId);
  touchPlayer(room, targetPlayerId);
  if (sender.playerId === target.playerId) {
    return res.status(400).json({ ok: false, error: "Cannot react to yourself" });
  }
  if (sender.userId !== req.authUser.id) {
    return res.status(403).json({ ok: false, error: "Forbidden player" });
  }
  if (sender.disconnectedAt || target.disconnectedAt) {
    return res.status(400).json({ ok: false, error: "Disconnected player cannot react" });
  }

  if (!Array.isArray(room.reactionEvents)) room.reactionEvents = [];
  room.reactionEvents.push({
    id: crypto.randomBytes(8).toString("hex"),
    fromPlayerId: sender.playerId,
    fromNickname: sender.nickname,
    toPlayerId: target.playerId,
    toNickname: target.nickname,
    emoji,
    ts: Date.now(),
  });
  if (room.reactionEvents.length > 80) {
    room.reactionEvents = room.reactionEvents.slice(-80);
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
  touchPlayer(room, playerId);

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
  await applyRatedResultIfNeeded(room);

  return res.json({ ok: true, room: roomPublicState(room) });
});

app.post("/race/leave", async (req, res) => {
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
    await applyRatedResultIfNeeded(room);
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
  await applyRatedResultIfNeeded(room);

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
  await ensureBotUsers();
  app.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
