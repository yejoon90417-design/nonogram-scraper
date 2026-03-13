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
const PVP_SHOWDOWN_MS = 5200;
const PVP_REVEAL_MS = 4200;
const PVP_MATCH_DELAY_MIN_MS = Math.max(1000, Number(process.env.PVP_MATCH_DELAY_MIN_MS || 1000));
const PVP_MATCH_DELAY_MAX_MS = Math.max(
  PVP_MATCH_DELAY_MIN_MS,
  Number(process.env.PVP_MATCH_DELAY_MAX_MS || 44000)
);
const RACE_INACTIVITY_TIMEOUT_MS = Math.max(5000, Number(process.env.RACE_INACTIVITY_TIMEOUT_MS || 60000));
const PVP_BOT_ENABLED_DEFAULT = process.env.PVP_BOT_ENABLED !== "false";
let pvpBotEnabledRuntime = PVP_BOT_ENABLED_DEFAULT;
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || "").trim();
const PVP_BOT_WAIT_MS = Math.max(3000, Number(process.env.PVP_BOT_WAIT_MS || 12000));
const PVP_BOT_WAIT_MIN_MS = Math.max(
  3000,
  Number(process.env.PVP_BOT_WAIT_MIN_MS || Math.floor(PVP_BOT_WAIT_MS * 0.7))
);
const PVP_BOT_WAIT_MAX_MS = Math.max(
  PVP_BOT_WAIT_MIN_MS + 1500,
  Number(process.env.PVP_BOT_WAIT_MAX_MS || Math.floor(PVP_BOT_WAIT_MS * 1.9))
);
const PVP_BOT_MATCH_BASE_CHANCE = Math.max(
  0.1,
  Math.min(0.95, Number(process.env.PVP_BOT_MATCH_BASE_CHANCE || 0.33))
);
const PVP_BOT_MATCH_MAX_CHANCE = Math.max(
  PVP_BOT_MATCH_BASE_CHANCE,
  Math.min(0.99, Number(process.env.PVP_BOT_MATCH_MAX_CHANCE || 0.9))
);
const PVP_BOT_RETRY_MIN_MS = Math.max(1000, Number(process.env.PVP_BOT_RETRY_MIN_MS || 1400));
const PVP_BOT_RETRY_MAX_MS = Math.max(
  PVP_BOT_RETRY_MIN_MS,
  Number(process.env.PVP_BOT_RETRY_MAX_MS || 4200)
);
const PVP_BOT_POOL_MIN = 15;
const PVP_BOT_EXCLUDE_EASY = process.env.PVP_BOT_EXCLUDE_EASY !== "false";
const PVP_BOT_LADDER_ENABLED = process.env.PVP_BOT_LADDER_ENABLED !== "false";
const PVP_BOT_LADDER_INTERVAL_MS = Math.max(
  10000,
  Number(process.env.PVP_BOT_LADDER_INTERVAL_MS || 420000)
);
const PVP_BOT_LADDER_RECENT_PAIR_TTL_MS = Math.max(
  PVP_BOT_LADDER_INTERVAL_MS * 4,
  Number(process.env.PVP_BOT_LADDER_RECENT_PAIR_TTL_MS || 1000 * 60 * 20)
);
const PVP_BOT_LADDER_RECENT_PAIR_LIMIT = Math.max(
  4,
  Number(process.env.PVP_BOT_LADDER_RECENT_PAIR_LIMIT || 24)
);
const PVP_BOT_RECENT_APPEARANCE_TTL_MS = Math.max(
  1000 * 60 * 45,
  Number(process.env.PVP_BOT_RECENT_APPEARANCE_TTL_MS || 1000 * 60 * 90)
);
const PVP_BOT_RECENT_APPEARANCE_LIMIT = Math.max(
  20,
  Number(process.env.PVP_BOT_RECENT_APPEARANCE_LIMIT || 160)
);
const REPLAY_FRAME_MIN_INTERVAL_MS = Math.max(80, Number(process.env.REPLAY_FRAME_MIN_INTERVAL_MS || 140));
const REPLAY_MAX_FRAMES = Math.max(200, Number(process.env.REPLAY_MAX_FRAMES || 2400));
const PVP_FAKE_QUEUE_ENABLED = process.env.PVP_FAKE_QUEUE_ENABLED !== "false";
const CURRENT_PLACEMENT_VERSION = Math.max(1, Number(process.env.PLACEMENT_VERSION || 1));
const ACTIVE_SITE_VOTE = {
  key: "site-vote-2026-03",
  titleKo: "간단 투표",
  titleEn: "Quick Vote",
  questionKo: "어떤 디자인이 더 맘에드시나요?",
  questionEn: "Which design fits better?",
  options: [
    {
      key: "vote-1",
      labelKo: "1번",
      labelEn: "Option 1",
      imagePath: "/votes/vote1.png",
    },
    {
      key: "vote-2",
      labelKo: "2번",
      labelEn: "Option 2",
      imagePath: "/votes/vote2.png",
    },
  ],
};
const ACTIVE_SITE_VOTE_OPTION_KEYS = ACTIVE_SITE_VOTE.options.map((option) => option.key);
const PVP_FAKE_QUEUE_MIN = Math.max(0, Number(process.env.PVP_FAKE_QUEUE_MIN || 0));
const PVP_FAKE_QUEUE_MAX = Math.max(PVP_FAKE_QUEUE_MIN, Number(process.env.PVP_FAKE_QUEUE_MAX || 6));
const PVP_FAKE_QUEUE_UPDATE_MS = Math.max(1200, Number(process.env.PVP_FAKE_QUEUE_UPDATE_MS || 3200));
const PLACEMENT_TIME_LIMIT_SEC = 300;
const PLACEMENT_STAGE_COUNT = 5;
const PVP_SIZE_OPTIONS = [
  [5, 5],
  [10, 10],
  [15, 15],
  [20, 20],
  [25, 25],
];
const PVP_SIZE_OPTIONS_LOW_TIER = [
  [5, 5],
  [10, 10],
  [15, 15],
];
const PVP_SIZE_OPTIONS_HIGH_TIER = [
  [10, 10],
  [15, 15],
  [20, 20],
  [25, 25],
];
const HALL_TOP_LIMIT = 3;
const DEFAULT_PROFILE_AVATAR_KEY = "default-user";
const LEGACY_SPECIAL_AVATAR_KEY_MAP = {
  "default-rank-1": "special-rating-1",
  "default-rank-2": "special-rating-2",
  "default-rank-3": "special-rating-3",
};
const SPECIAL_PROFILE_AVATAR_KEYS = [
  "special-rating-1",
  "special-rating-2",
  "special-rating-3",
  "special-streak-1",
  "special-streak-2",
  "special-streak-3",
];
const DEFAULT_PROFILE_AVATAR_KEYS = [
  "default-user",
  "default-ember",
  "default-rose",
  "default-mint",
  "default-violet",
  "default-cobalt",
  "default-sky",
  "default-ocean",
  "default-forest",
  "default-sage",
  "default-lavender",
  "default-orchid",
  "default-plum",
  "default-crimson",
  "default-coral",
  "default-peach",
  "default-sand",
  "default-lemon",
  "default-lime",
  "default-teal",
  "default-aqua",
  "default-azure",
  "default-navy",
  "default-slate",
  "default-silverline",
  "default-goldline",
  "default-bronzeline",
  "default-berry",
  "default-fuchsia",
  "default-ruby",
  "default-ice",
  "default-cloud",
  "default-night",
  "default-spring",
  "default-sunset",
  "default-dawn",
  "default-trophy",
  "default-lock",
  "default-sun",
  "default-moon",
  "default-settings",
  "default-home",
  "default-sound",
  "default-undo",
  "default-redo",
  "default-eraser",
  "default-honey",
  "default-tiger",
  "default-rabbit",
  "default-dog",
  "default-wolf",
  "default-koala",
  "default-monkey",
  "default-chick",
  "default-owl",
  "default-turtle",
  "default-crab",
  "default-mushroom",
  "default-cactus",
  "default-pizza",
  "default-burger",
  "default-donut",
  "default-ball",
  "default-dice",
  "default-headphone",
  "default-book",
  "default-pencil",
  "default-lightbulb",
  "default-magnet",
  "default-anchor",
];
const PVP_BOT_NAME_POOL = [
  "Mina", "Jisoo", "Hana", "Yuna", "Sora", "Aria", "Noah", "Liam",
  "Ava", "Ella", "Sena", "Haru", "Minji", "Yejin", "Rina", "Nari",
  "Leo", "Nico", "Jude", "Evan", "Kira", "Ryu", "Dami", "Suji",
];
const BOT_DIFFICULTY_WEIGHTS = [
  ["easy", 25],
  ["normal", 25],
  ["hard", 50],
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
const BOT_SPAWN_WEIGHT_MIN = 1;
const BOT_SPAWN_WEIGHT_MAX = 9;
const BOT_SPAWN_WEIGHT_TIERS = [
  [6, 35], // frequently seen
  [3, 45], // normal
  [1, 20], // rare
];
const BOT_SOLVE_TIME_RANGE_SEC = {
  "5x5": {
    easy: [120, 180],
    normal: [45, 108],
    hard: [14, 28],
  },
  "10x10": {
    easy: [300, 360],
    normal: [108, 216],
    hard: [57, 85],
  },
  "15x15": {
    easy: [960, 1500],
    normal: [540, 810],
    hard: [285, 399],
  },
  "20x20": {
    easy: [1500, 1800],
    normal: [810, 1080],
    hard: [399, 570],
  },
  "25x25": {
    easy: [2700, 3000],
    normal: [1134, 1890],
    hard: [855, 1140],
  },
};
const ELO_DEFAULT_RATING = 1500;
const RATING_WIN_BASE = Math.max(1, Number(process.env.RATING_WIN_BASE || 30));
const RATING_LOSS_BASE = Math.max(1, Number(process.env.RATING_LOSS_BASE || 18));
const WIN_STREAK_BONUS_TABLE = [
  [5, 10],
  [4, 7],
  [3, 5],
  [2, 3],
];
const TIER_BANDS = [
  { key: "bronze", min: 0, max: 999 },
  { key: "silver", min: 1000, max: 1499 },
  { key: "gold", min: 1500, max: 1999 },
  { key: "diamond", min: 2000, max: 2499 },
  { key: "master", min: 2500, max: Number.POSITIVE_INFINITY },
];
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
let pvpBotLadderTimer = null;
let pvpBotLadderRunning = false;
const pvpBotLadderRecentPairs = [];
const pvpRecentBotAppearances = [];

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

function emptyBitsBase64(width, height) {
  return Buffer.alloc(expectedByteLength(width, height)).toString("base64");
}

function sanitizeReplayFrames(rawFrames) {
  if (!Array.isArray(rawFrames)) return [];
  const frames = [];
  for (const f of rawFrames) {
    if (!f || typeof f.bits !== "string") continue;
    const atMs = Number(f.atMs);
    if (!Number.isFinite(atMs)) continue;
    frames.push({
      atMs: Math.max(0, Math.floor(atMs)),
      bits: f.bits,
    });
  }
  frames.sort((a, b) => a.atMs - b.atMs);
  if (!frames.length) return [];
  const deduped = [frames[0]];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const cur = frames[i];
    if (cur.atMs === prev.atMs) {
      deduped[deduped.length - 1] = cur;
    } else {
      deduped.push(cur);
    }
  }
  return deduped;
}

function downsampleReplayFrames(frames, maxFrames = REPLAY_MAX_FRAMES) {
  const safe = sanitizeReplayFrames(frames);
  if (safe.length <= maxFrames) return safe;
  if (maxFrames <= 1) return [safe[safe.length - 1]];
  const out = [];
  const step = (safe.length - 1) / (maxFrames - 1);
  for (let i = 0; i < maxFrames; i += 1) {
    const idx = Math.round(i * step);
    out.push(safe[idx]);
  }
  return sanitizeReplayFrames(out);
}

function captureReplayFrame(room, player, userBits, now = Date.now()) {
  if (!room || !player || !Buffer.isBuffer(userBits)) return;
  if (player.isBot === true) return;
  if (!room.gameStartAt) return;
  const gameStartAt = Number(room.gameStartAt || now);
  const atMs = Math.max(0, Math.floor(now - gameStartAt));
  const bits = userBits.toString("base64");
  if (!Array.isArray(player.progressFrames)) {
    player.progressFrames = [];
  }
  if (!player.progressFrames.length) {
    player.progressFrames.push({ atMs: 0, bits: emptyBitsBase64(room.width, room.height) });
  }
  const last = player.progressFrames[player.progressFrames.length - 1] || null;
  if (last && last.bits === bits) {
    player.lastReplayFrameAt = atMs;
    player.lastReplayBits = bits;
    return;
  }
  if (last && atMs - Number(last.atMs || 0) < REPLAY_FRAME_MIN_INTERVAL_MS && player.progressFrames.length > 1) {
    player.progressFrames[player.progressFrames.length - 1] = { atMs, bits };
  } else {
    player.progressFrames.push({ atMs, bits });
  }
  if (player.progressFrames.length > REPLAY_MAX_FRAMES) {
    player.progressFrames = downsampleReplayFrames(player.progressFrames, REPLAY_MAX_FRAMES);
  }
  player.lastReplayFrameAt = atMs;
  player.lastReplayBits = bits;
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

function normalizeUiLang(raw) {
  return String(raw || "").trim().toLowerCase() === "en" ? "en" : "ko";
}

function normalizeUiTheme(raw) {
  return String(raw || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function normalizeUiSoundVolume(raw, legacyOn = undefined) {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (legacyOn === false) return 0;
  if (legacyOn === true) return 100;
  return 100;
}

function parseHallAvatarKey(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const match = value.match(/^hall\-(5x5|10x10|15x15|20x20|25x25)\-([123])$/);
  if (!match) return null;
  return {
    key: value,
    sizeKey: match[1],
    rank: Number(match[2]),
  };
}

function buildHallAvatarKey(sizeKey, rank) {
  return `hall-${sizeKey}-${rank}`;
}

function normalizeProfileAvatarKey(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const normalized = LEGACY_SPECIAL_AVATAR_KEY_MAP[value] || value;
  if (!normalized) return DEFAULT_PROFILE_AVATAR_KEY;
  if (DEFAULT_PROFILE_AVATAR_KEYS.includes(normalized)) return normalized;
  if (SPECIAL_PROFILE_AVATAR_KEYS.includes(normalized)) return normalized;
  const hall = parseHallAvatarKey(normalized);
  if (hall) return hall.key;
  return DEFAULT_PROFILE_AVATAR_KEY;
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
    `SELECT u.id, u.username, u.nickname, u.rating, u.rating_games, u.rating_wins, u.rating_losses,
            u.win_streak_current, u.win_streak_best, u.profile_avatar_key,
            u.ui_lang, u.ui_theme, u.ui_sound_on, u.ui_sound_volume,
            u.placement_done, u.placement_rating, u.placement_tier_key, u.placement_version,
            u.placement_completed_at_ms, u.placement_solved_sequential, u.placement_elapsed_sec
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

function sanitizeSelectedAvatarKey(selectedKeyRaw, unlockedSpecialAvatarKeys = []) {
  const selectedKey = normalizeProfileAvatarKey(selectedKeyRaw);
  if (DEFAULT_PROFILE_AVATAR_KEYS.includes(selectedKey)) return selectedKey;
  return unlockedSpecialAvatarKeys.includes(selectedKey) ? selectedKey : DEFAULT_PROFILE_AVATAR_KEY;
}

async function fetchUnlockedHallAvatarRewards(userId) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return [];
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT
         h.user_id,
         h.width,
         h.height,
         h.elapsed_sec,
         h.finished_at_ms,
         ROW_NUMBER() OVER (
           PARTITION BY h.width, h.height
           ORDER BY h.elapsed_sec ASC, h.game_start_at_ms ASC, h.id ASC
         ) AS rank_pos
       FROM hall_replay_records h
       WHERE h.elapsed_sec > 0
     )
     SELECT width, height, elapsed_sec, finished_at_ms, rank_pos
     FROM ranked
     WHERE user_id = $1
       AND rank_pos <= 3
     ORDER BY width ASC, height ASC, rank_pos ASC`,
    [Number(userId)]
  );
  return rows.map((row) => {
    const sizeKey = `${Number(row.width)}x${Number(row.height)}`;
    const rank = Number(row.rank_pos);
    return {
      key: buildHallAvatarKey(sizeKey, rank),
      sizeKey,
      rank,
      elapsedSec: Number(row.elapsed_sec),
      finishedAtMs: Number(row.finished_at_ms || 0),
    };
  });
}

async function fetchUnlockedSpecialAvatarRewards(userId) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) return [];
  const rewards = [...(await fetchUnlockedHallAvatarRewards(numericUserId))];

  const { rows: ratingRows } = await pool.query(
    `SELECT ranked.rank_pos
     FROM (
       SELECT
         u.id,
         ROW_NUMBER() OVER (
           ORDER BY u.rating DESC, u.rating_wins DESC, u.rating_games DESC, u.id ASC
         ) AS rank_pos
       FROM users u
     ) ranked
     WHERE ranked.id = $1
       AND ranked.rank_pos <= 3
     LIMIT 1`,
    [numericUserId]
  );
  if (ratingRows.length) {
    const rank = Number(ratingRows[0].rank_pos || 0);
    if (rank >= 1 && rank <= 3) {
      rewards.push({ key: `special-rating-${rank}`, rank, category: "rating" });
    }
  }

  const { rows: streakRows } = await pool.query(
    `SELECT ranked.rank_pos, ranked.win_streak_best
     FROM (
       SELECT
         u.id,
         u.win_streak_best,
         ROW_NUMBER() OVER (
           ORDER BY u.win_streak_best DESC, u.rating DESC, u.id ASC
         ) AS rank_pos
       FROM users u
       WHERE u.is_bot = false
         AND u.win_streak_best > 0
     ) ranked
     WHERE ranked.id = $1
       AND ranked.rank_pos <= 3
     LIMIT 1`,
    [numericUserId]
  );
  if (streakRows.length) {
    const rank = Number(streakRows[0].rank_pos || 0);
    if (rank >= 1 && rank <= 3) {
      rewards.push({
        key: `special-streak-${rank}`,
        rank,
        category: "streak",
        winStreakBest: Number(streakRows[0].win_streak_best || 0),
      });
    }
  }

  return rewards;
}

async function fetchUserRatingRank(userId) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return null;
  const { rows } = await pool.query(
    `SELECT ranked.rank_pos
     FROM (
       SELECT id, ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN rating ELSE 0 END DESC,
           rating_wins DESC,
           rating_games DESC,
           id ASC
       ) AS rank_pos
       FROM users
     ) AS ranked
     WHERE ranked.id = $1
     LIMIT 1`,
    [Number(userId)]
  );
  return rows.length ? Number(rows[0].rank_pos) : null;
}

async function buildUserProfilePayload(userId, { includeUsername = false } = {}) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return null;
  const { rows } = await pool.query(
    `SELECT id, username, nickname, is_bot, rating, rating_games, rating_wins, rating_losses,
            win_streak_current, win_streak_best, profile_avatar_key,
            placement_done, placement_rating, placement_tier_key, placement_version,
            placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [Number(userId)]
  );
  if (!rows.length) return null;
  const user = rows[0];
  const hallRewards = await fetchUnlockedHallAvatarRewards(user.id);
  const specialRewards = await fetchUnlockedSpecialAvatarRewards(user.id);
  const unlockedHallAvatarKeys = hallRewards.map((reward) => reward.key);
  const unlockedSpecialAvatarKeys = specialRewards.map((reward) => reward.key);
  const ratingRank = await fetchUserRatingRank(user.id);
  const games = Number(user.rating_games || 0);
  const wins = Number(user.rating_wins || 0);
  const placementActive = hasActivePlacement(user);
  return {
    id: Number(user.id),
    username: includeUsername ? String(user.username || "") : undefined,
    nickname: String(user.nickname || ""),
    isBot: user.is_bot === true,
    rating: getDisplayRating(user),
    ratingRank,
    rating_games: games,
    rating_wins: wins,
    rating_losses: Number(user.rating_losses || 0),
    win_streak_current: Number(user.win_streak_current || 0),
    win_streak_best: Number(user.win_streak_best || 0),
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    profile_avatar_key: sanitizeSelectedAvatarKey(user.profile_avatar_key, unlockedSpecialAvatarKeys),
    hallRewards,
    specialRewards,
    unlockedHallAvatarKeys,
    unlockedSpecialAvatarKeys,
    placement_done: placementActive,
    placement_rating: placementActive ? Number(user.placement_rating || 0) : null,
    placement_tier_key: placementActive ? String(user.placement_tier_key || "") : "",
    placement_version: Number(user.placement_version || 0),
    placement_completed_at_ms: placementActive ? Number(user.placement_completed_at_ms || 0) : null,
    placement_solved_sequential: placementActive ? Number(user.placement_solved_sequential || 0) : 0,
    placement_elapsed_sec: placementActive ? Number(user.placement_elapsed_sec || 0) : 0,
  };
}

function propagateProfileAvatarSelection(userId, profileAvatarKey) {
  const nextAvatarKey = normalizeProfileAvatarKey(profileAvatarKey);
  for (const room of raceRooms.values()) {
    for (const player of room.players.values()) {
      if (Number(player.userId) === Number(userId)) {
        player.profileAvatarKey = nextAvatarKey;
      }
    }
  }
  for (const ticket of pvpQueueTickets.values()) {
    if (Number(ticket.userId) === Number(userId)) {
      ticket.profileAvatarKey = nextAvatarKey;
    }
  }
  for (const match of pvpMatches.values()) {
    for (const player of match.players) {
      if (Number(player.userId) === Number(userId)) {
        player.profileAvatarKey = nextAvatarKey;
      }
    }
  }
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
      ADD COLUMN IF NOT EXISTS win_streak_current INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS win_streak_best INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS bot_skill VARCHAR(16),
      ADD COLUMN IF NOT EXISTS bot_spawn_weight INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS profile_avatar_key VARCHAR(64) NOT NULL DEFAULT '${DEFAULT_PROFILE_AVATAR_KEY}',
      ADD COLUMN IF NOT EXISTS ui_lang VARCHAR(8) NOT NULL DEFAULT 'ko',
      ADD COLUMN IF NOT EXISTS ui_theme VARCHAR(8) NOT NULL DEFAULT 'light',
      ADD COLUMN IF NOT EXISTS ui_sound_on BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS ui_sound_volume INTEGER,
      ADD COLUMN IF NOT EXISTS placement_done BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS placement_rating INTEGER,
      ADD COLUMN IF NOT EXISTS placement_tier_key VARCHAR(32),
      ADD COLUMN IF NOT EXISTS placement_version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS placement_completed_at_ms BIGINT,
      ADD COLUMN IF NOT EXISTS placement_solved_sequential INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS placement_elapsed_sec INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`UPDATE users SET ui_lang = 'ko' WHERE ui_lang IS NULL OR ui_lang NOT IN ('ko', 'en')`);
  await pool.query(`UPDATE users SET ui_theme = 'light' WHERE ui_theme IS NULL OR ui_theme NOT IN ('light', 'dark')`);
  await pool.query(
    `UPDATE users
     SET ui_sound_volume = CASE
       WHEN ui_sound_on = false THEN 0
       ELSE 100
     END
     WHERE ui_sound_volume IS NULL`
  );
  await pool.query(
    `UPDATE users
     SET ui_sound_volume = GREATEST(0, LEAST(100, ui_sound_volume)),
        ui_sound_on = (GREATEST(0, LEAST(100, ui_sound_volume)) > 0)`
  );
  await pool.query(
    `UPDATE users
     SET profile_avatar_key = $1
     WHERE profile_avatar_key IS NULL OR profile_avatar_key = ''`,
    [DEFAULT_PROFILE_AVATAR_KEY]
  );
  await pool.query(
    `UPDATE users
       SET placement_tier_key = CASE
       WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} AND placement_rating IS NOT NULL AND placement_rating >= 2500 THEN 'master'
       WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} AND placement_rating IS NOT NULL AND placement_rating >= 2000 THEN 'diamond'
       WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} AND placement_rating IS NOT NULL AND placement_rating >= 1500 THEN 'gold'
       WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} AND placement_rating IS NOT NULL AND placement_rating >= 1000 THEN 'silver'
       WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} AND placement_rating IS NOT NULL THEN 'bronze'
       ELSE ''
     END
     WHERE placement_tier_key IS NULL`
  );
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_match_logs (
      id BIGSERIAL PRIMARY KEY,
      room_code VARCHAR(16) NOT NULL,
      game_start_at_ms BIGINT NOT NULL,
      room_created_at_ms BIGINT NOT NULL,
      mode VARCHAR(32) NOT NULL,
      puzzle_id BIGINT,
      width INTEGER,
      height INTEGER,
      winner_user_id BIGINT,
      winner_nickname VARCHAR(64),
      player_count INTEGER NOT NULL DEFAULT 0,
      participants TEXT NOT NULL DEFAULT '',
      rankings_json JSONB NOT NULL,
      players_json JSONB NOT NULL,
      finished_at_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (room_code, game_start_at_ms)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_race_match_logs_finished_desc ON race_match_logs (finished_at_ms DESC);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_race_match_logs_mode ON race_match_logs (mode);`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS best_replay_records (
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname VARCHAR(64) NOT NULL,
      elapsed_sec INTEGER NOT NULL,
      puzzle_id BIGINT NOT NULL,
      game_start_at_ms BIGINT NOT NULL,
      frames_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (width, height)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_best_replay_records_elapsed ON best_replay_records (elapsed_sec ASC);`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hall_replay_records (
      id BIGSERIAL PRIMARY KEY,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname VARCHAR(64) NOT NULL,
      elapsed_sec INTEGER NOT NULL,
      puzzle_id BIGINT NOT NULL,
      game_start_at_ms BIGINT NOT NULL,
      finished_at_ms BIGINT NOT NULL,
      frames_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (width, height, user_id, puzzle_id, game_start_at_ms)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_hall_replay_size_elapsed ON hall_replay_records (width, height, elapsed_sec ASC, game_start_at_ms ASC);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_hall_replay_size_finished_desc ON hall_replay_records (width, height, finished_at_ms DESC);`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_vote_responses (
      id BIGSERIAL PRIMARY KEY,
      vote_key VARCHAR(64) NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_key VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (vote_key, user_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_site_vote_responses_vote_key ON site_vote_responses (vote_key);`
  );
  // Defensive cleanup for legacy bad records.
  await pool.query(`DELETE FROM best_replay_records WHERE elapsed_sec <= 0`);
  await pool.query(`DELETE FROM hall_replay_records WHERE elapsed_sec <= 0`);
  const { rows: hallCountRows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM hall_replay_records`);
  const hallCount = hallCountRows.length ? Number(hallCountRows[0].cnt || 0) : 0;
  if (hallCount === 0) {
    await pool.query(
      `INSERT INTO hall_replay_records (
        width, height, user_id, nickname, elapsed_sec, puzzle_id, game_start_at_ms, finished_at_ms, frames_json
      )
      SELECT
        b.width,
        b.height,
        b.user_id,
        b.nickname,
        b.elapsed_sec,
        b.puzzle_id,
        b.game_start_at_ms,
        (b.game_start_at_ms + (b.elapsed_sec::bigint * 1000)) AS finished_at_ms,
        b.frames_json
      FROM best_replay_records b
      JOIN users u ON u.id = b.user_id
      WHERE u.is_bot = false
        AND b.elapsed_sec > 0
      ON CONFLICT (width, height, user_id, puzzle_id, game_start_at_ms) DO NOTHING`
    );
  }
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

function normalizeBotSpawnWeight(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  return Math.max(BOT_SPAWN_WEIGHT_MIN, Math.min(BOT_SPAWN_WEIGHT_MAX, n));
}

function normalizeRatingValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return ELO_DEFAULT_RATING;
  return Math.max(0, Math.round(n));
}

function normalizeRatingRank(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function hasActivePlacement(user) {
  if (!user || typeof user !== "object") return false;
  return user.placement_done === true && Number(user.placement_version || 0) === CURRENT_PLACEMENT_VERSION;
}

function getDisplayRating(user) {
  if (!user || typeof user !== "object") return 0;
  return hasActivePlacement(user) ? normalizeRatingValue(user.rating) : 0;
}

function evaluatePlacementResult(rawResults, elapsedSecRaw, currentStageProgressRaw = 0) {
  const elapsedSec = Math.max(1, Math.min(PLACEMENT_TIME_LIMIT_SEC, Math.floor(Number(elapsedSecRaw || 0))));
  const currentStageProgress = Math.max(0, Math.min(1, Number(currentStageProgressRaw || 0)));
  const results = Array.isArray(rawResults) ? rawResults : [];
  let solvedSequential = 0;
  for (const row of results) {
    if (String(row?.status || "") === "solved") solvedSequential += 1;
    else break;
  }

  let minRating = 0;
  let maxRating = 999;
  if (solvedSequential >= 5) {
    minRating = 2200;
    maxRating = 2499;
  } else if (solvedSequential === 4) {
    minRating = 2000;
    maxRating = 2299;
  } else if (solvedSequential === 3) {
    minRating = 1500;
    maxRating = 1999;
  } else if (solvedSequential === 2) {
    minRating = 1000;
    maxRating = 1499;
  } else if (solvedSequential === 1) {
    minRating = 500;
    maxRating = 999;
  } else {
    minRating = 0;
    maxRating = 699;
  }

  const timeScore = Math.max(0, Math.min(1, (PLACEMENT_TIME_LIMIT_SEC - elapsedSec) / PLACEMENT_TIME_LIMIT_SEC));
  const performance = Math.max(0, Math.min(1, 0.7 + 0.3 * Math.sqrt(timeScore)));
  const currentStage = results[solvedSequential];
  const hasPendingCurrent = currentStage && String(currentStage.status || "") === "pending";
  const stageProgress = hasPendingCurrent ? currentStageProgress : 0;
  const stageBonusCap =
    solvedSequential >= 3 ? 220 : solvedSequential === 2 ? 140 : solvedSequential === 1 ? 100 : 70;
  const stageProgressBonus = Math.round(stageBonusCap * Math.pow(stageProgress, 0.9));
  const rating = Math.round(
    Math.max(0, Math.min(2499, minRating + (maxRating - minRating) * performance + stageProgressBonus))
  );
  return {
    rating,
    tierKey: getTierByRating(rating).key,
    solvedSequential,
    elapsedSec,
  };
}

function buildClientUser(user) {
  const placementActive = hasActivePlacement(user);
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    rating: getDisplayRating(user),
    rating_games: user.rating_games,
    rating_wins: user.rating_wins,
    rating_losses: user.rating_losses,
    win_streak_current: user.win_streak_current,
    win_streak_best: user.win_streak_best,
    profile_avatar_key: user.profile_avatar_key,
    ui_lang: user.ui_lang,
    ui_theme: user.ui_theme,
    ui_sound_on: user.ui_sound_on,
    ui_sound_volume: user.ui_sound_volume,
    placement_done: placementActive,
    placement_rating: placementActive ? Number(user.placement_rating || 0) : null,
    placement_tier_key: placementActive ? String(user.placement_tier_key || "") : "",
    placement_version: Number(user.placement_version || 0),
    placement_completed_at_ms: placementActive ? Number(user.placement_completed_at_ms || 0) : null,
    placement_solved_sequential: placementActive ? Number(user.placement_solved_sequential || 0) : 0,
    placement_elapsed_sec: placementActive ? Number(user.placement_elapsed_sec || 0) : 0,
  };
}

async function buildActiveSiteVotePayloadForUser(userId) {
  const numericUserId = Number(userId || 0);
  const countsPromise = pool.query(
    `SELECT option_key, COUNT(*)::int AS count
     FROM site_vote_responses
     WHERE vote_key = $1
     GROUP BY option_key`,
    [ACTIVE_SITE_VOTE.key]
  );
  const userVotePromise = numericUserId > 0
    ? pool.query(
      `SELECT option_key, created_at
       FROM site_vote_responses
       WHERE vote_key = $1
         AND user_id = $2
       LIMIT 1`,
      [ACTIVE_SITE_VOTE.key, numericUserId]
    )
    : Promise.resolve({ rows: [] });
  const [countsResult, userVoteResult] = await Promise.all([countsPromise, userVotePromise]);
  const counts = Object.fromEntries(ACTIVE_SITE_VOTE.options.map((option) => [option.key, 0]));
  for (const row of countsResult.rows) {
    const optionKey = String(row.option_key || "");
    if (Object.prototype.hasOwnProperty.call(counts, optionKey)) {
      counts[optionKey] = Number(row.count || 0);
    }
  }
  const userVote = userVoteResult.rows[0] || null;
  const votedOptionKey = userVote ? String(userVote.option_key || "") : "";
  const totalVotes = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    key: ACTIVE_SITE_VOTE.key,
    titleKo: ACTIVE_SITE_VOTE.titleKo,
    titleEn: ACTIVE_SITE_VOTE.titleEn,
    questionKo: ACTIVE_SITE_VOTE.questionKo,
    questionEn: ACTIVE_SITE_VOTE.questionEn,
    pending: !votedOptionKey,
    hasVoted: Boolean(votedOptionKey),
    votedOptionKey,
    votedAt: userVote?.created_at ? new Date(userVote.created_at).getTime() : null,
    totalVotes,
    options: ACTIVE_SITE_VOTE.options.map((option) => ({
      key: option.key,
      labelKo: option.labelKo,
      labelEn: option.labelEn,
      imagePath: option.imagePath,
      count: counts[option.key] || 0,
    })),
  };
}

async function persistPlacementResultForUser(userId, rawResults, elapsedSecRaw, currentStageProgressRaw = 0) {
  const placement = evaluatePlacementResult(rawResults, elapsedSecRaw, currentStageProgressRaw);
  const completedAtMs = Date.now();
  const { rows } = await pool.query(
    `UPDATE users
     SET placement_done = true,
         placement_rating = $2,
         placement_tier_key = $3,
         placement_version = $4,
         placement_completed_at_ms = $5,
         placement_solved_sequential = $6,
         placement_elapsed_sec = $7,
         rating = $2
     WHERE id = $1
     RETURNING id, username, nickname, rating, rating_games, rating_wins, rating_losses,
               win_streak_current, win_streak_best, profile_avatar_key,
               ui_lang, ui_theme, ui_sound_on, ui_sound_volume,
               placement_done, placement_rating, placement_tier_key, placement_version,
               placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec`,
    [
      Number(userId),
      placement.rating,
      placement.tierKey,
      CURRENT_PLACEMENT_VERSION,
      completedAtMs,
      placement.solvedSequential,
      placement.elapsedSec,
    ]
  );
  return {
    placement: {
      ...placement,
      completedAtMs,
    },
    user: rows[0] || null,
  };
}

function getTierByRating(rawRating) {
  const rating = normalizeRatingValue(rawRating);
  for (const band of TIER_BANDS) {
    if (rating >= band.min && rating <= band.max) return band;
  }
  return TIER_BANDS[TIER_BANDS.length - 1];
}

function getTierIndexByRating(rawRating) {
  const tier = getTierByRating(rawRating);
  return Math.max(
    0,
    TIER_BANDS.findIndex((b) => b.key === tier.key)
  );
}

function getAllowedTierGap(ticket, now = Date.now()) {
  const createdAt = Number(ticket?.createdAt || now);
  const waitedMs = Math.max(0, now - createdAt);
  if (waitedMs < 20000) return 0;
  if (waitedMs < 50000) return 1;
  return 2;
}

function canTierMatch(ticketA, ticketB, now = Date.now()) {
  const aTier = getTierIndexByRating(ticketA?.rating);
  const bTier = getTierIndexByRating(ticketB?.rating);
  const gap = Math.abs(aTier - bTier);
  return gap <= getAllowedTierGap(ticketA, now) && gap <= getAllowedTierGap(ticketB, now);
}

function tierMatchScore(ticketA, ticketB) {
  const aTier = getTierIndexByRating(ticketA?.rating);
  const bTier = getTierIndexByRating(ticketB?.rating);
  const tierGap = Math.abs(aTier - bTier);
  const ratingGap = Math.abs(normalizeRatingValue(ticketA?.rating) - normalizeRatingValue(ticketB?.rating));
  return tierGap * 10000 + ratingGap;
}

function pickRandomBotSpawnWeight() {
  const total = BOT_SPAWN_WEIGHT_TIERS.reduce((acc, [, weight]) => acc + Number(weight || 0), 0);
  if (total <= 0) return 3;
  let x = Math.random() * total;
  for (const [spawnWeight, chance] of BOT_SPAWN_WEIGHT_TIERS) {
    x -= Number(chance || 0);
    if (x <= 0) return normalizeBotSpawnWeight(spawnWeight) || 3;
  }
  return 3;
}

function buildBotIdentity() {
  const name = randomFrom(PVP_BOT_NAME_POOL) || "Player";
  const nickname = name;
  const username = `bot_${crypto.randomBytes(6).toString("hex").slice(0, 10)}`;
  const botSkill = pickRandomBotDifficulty();
  const botSpawnWeight = pickRandomBotSpawnWeight();
  return { username, nickname, botSkill, botSpawnWeight };
}

async function ensureBotUsers() {
  if (!pvpBotEnabledRuntime) return;
  const { rows: botRows } = await pool.query(
    `SELECT id, nickname, bot_skill, bot_spawn_weight FROM users WHERE is_bot = true ORDER BY id ASC`
  );
  const currentSpawnWeights = botRows
    .map((r) => normalizeBotSpawnWeight(r?.bot_spawn_weight))
    .filter((v) => Number.isInteger(v));
  const shouldRebalanceSpawnWeights = currentSpawnWeights.length > 0 && new Set(currentSpawnWeights).size <= 1;
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
    const rawSpawnWeight = normalizeBotSpawnWeight(row?.bot_spawn_weight);
    const fixedSpawnWeight =
      shouldRebalanceSpawnWeights || !Number.isInteger(rawSpawnWeight)
        ? pickRandomBotSpawnWeight()
        : rawSpawnWeight;
    if (!Number.isInteger(rawSpawnWeight) || rawSpawnWeight !== fixedSpawnWeight) {
      await pool.query(
        `UPDATE users
         SET bot_spawn_weight = $2
         WHERE id = $1 AND is_bot = true`,
        [botId, fixedSpawnWeight]
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
  let needed = Math.max(0, PVP_BOT_POOL_MIN - existingIds.length);
  while (needed > 0) {
    const identity = buildBotIdentity();
    const passwordHash = hashUserPassword(crypto.randomBytes(24).toString("hex"));
    const skill = normalizeBotDifficulty(identity.botSkill);
    const spawnWeight = normalizeBotSpawnWeight(identity.botSpawnWeight) || 3;
    try {
      await pool.query(
        `INSERT INTO users (
          username, nickname, password_hash, is_bot, bot_skill, bot_spawn_weight
        ) VALUES ($1, $2, $3, true, $4, $5)`,
        [
          identity.username,
          identity.nickname,
          passwordHash,
          skill,
          spawnWeight,
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

function getPvpSizeOptionsForTickets(ticketA, ticketB) {
  const tierA = String(getTierByRating(ticketA?.rating)?.key || "");
  const tierB = String(getTierByRating(ticketB?.rating)?.key || "");
  const bothGoldOrHigher =
    ["gold", "diamond", "master"].includes(tierA) &&
    ["gold", "diamond", "master"].includes(tierB);
  return bothGoldOrHigher ? PVP_SIZE_OPTIONS_HIGH_TIER : PVP_SIZE_OPTIONS_LOW_TIER;
}

function createPvpBotTicket(botUser, now = Date.now()) {
  const shortId = crypto.randomBytes(5).toString("hex");
  const userId = Number(botUser?.id);
  if (!Number.isInteger(userId)) return null;
  const nickname = String(botUser?.nickname || "").trim() || `Player${randomInt(100, 999)}`;
  const botSkill = normalizeBotDifficulty(botUser?.bot_skill);
  const botSpawnWeight = normalizeBotSpawnWeight(botUser?.bot_spawn_weight) || 3;
  const rating = normalizeRatingValue(botUser?.rating);
  const ratingRank = normalizeRatingRank(botUser?.rating_rank);
  const profileAvatarKey = normalizeProfileAvatarKey(botUser?.profile_avatar_key);
  return {
    ticketId: `bot-ticket-${shortId}`,
    userId,
    username: String(botUser?.username || ""),
    nickname,
    rating,
    ratingRank,
    profileAvatarKey,
    botSkill,
    botSpawnWeight,
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

function getBotTimeBucket(now = Date.now()) {
  const hour = new Date(now + 9 * 60 * 60 * 1000).getUTCHours();
  if (hour >= 6 && hour < 14) return "day";
  if (hour >= 14 && hour < 22) return "evening";
  return "night";
}

function getBotPreferredTimeBucket(botUserId) {
  const id = Math.abs(Number(botUserId || 0));
  const bucketIndex = id % 3;
  if (bucketIndex === 0) return "day";
  if (bucketIndex === 1) return "evening";
  return "night";
}

function getBotTimeAffinity(botUserId, now = Date.now()) {
  const currentBucket = getBotTimeBucket(now);
  const preferredBucket = getBotPreferredTimeBucket(botUserId);
  if (currentBucket === preferredBucket) return 1.75;
  if (preferredBucket === "evening" && currentBucket === "night") return 1.18;
  if (preferredBucket === "night" && currentBucket === "evening") return 1.12;
  return 0.68;
}

function pruneRecentBotAppearances(now = Date.now()) {
  for (let i = pvpRecentBotAppearances.length - 1; i >= 0; i -= 1) {
    const item = pvpRecentBotAppearances[i];
    if (!item || now - Number(item.at || 0) > PVP_BOT_RECENT_APPEARANCE_TTL_MS) {
      pvpRecentBotAppearances.splice(i, 1);
    }
  }
  while (pvpRecentBotAppearances.length > PVP_BOT_RECENT_APPEARANCE_LIMIT) {
    pvpRecentBotAppearances.shift();
  }
}

function getBotRecentAppearancePenalty(botUserId, targetUserId = null, now = Date.now()) {
  pruneRecentBotAppearances(now);
  const numericBotId = Number(botUserId || 0);
  const numericTargetId = Number(targetUserId || 0);
  let globalRank = -1;
  let sameTargetRank = -1;
  for (let i = pvpRecentBotAppearances.length - 1, seen = 0, seenSame = 0; i >= 0; i -= 1) {
    const item = pvpRecentBotAppearances[i];
    if (Number(item.botUserId) === numericBotId) {
      if (globalRank === -1) globalRank = seen;
      seen += 1;
      if (Number.isInteger(numericTargetId) && numericTargetId > 0 && Number(item.targetUserId) === numericTargetId) {
        if (sameTargetRank === -1) sameTargetRank = seenSame;
        seenSame += 1;
      }
    }
  }
  if (sameTargetRank === 0) return 0.04;
  if (sameTargetRank === 1) return 0.12;
  if (sameTargetRank >= 2) return 0.35;
  if (globalRank === 0) return 0.08;
  if (globalRank === 1) return 0.18;
  if (globalRank >= 2 && globalRank <= 4) return 0.48;
  if (globalRank >= 5 && globalRank <= 8) return 0.74;
  return 1;
}

function markRecentBotAppearance(botUserId, targetUserId = null, now = Date.now()) {
  const numericBotId = Number(botUserId || 0);
  if (!Number.isInteger(numericBotId)) return;
  pruneRecentBotAppearances(now);
  pvpRecentBotAppearances.push({
    botUserId: numericBotId,
    targetUserId: Number.isInteger(Number(targetUserId || 0)) ? Number(targetUserId || 0) : null,
    at: now,
  });
}

function getBotTierAffinity(botTicket, targetTicket = null) {
  if (!targetTicket) return 1;
  const botTier = getTierIndexByRating(botTicket?.rating);
  const targetTier = getTierIndexByRating(targetTicket?.rating);
  const gap = Math.abs(botTier - targetTier);
  if (gap === 0) return 2.4;
  if (gap === 1) return 1.08;
  if (gap === 2) return 0.28;
  return 0.08;
}

function buildBotCandidateWeight(botTicket, targetTicket = null, now = Date.now()) {
  const baseWeight = normalizeBotSpawnWeight(botTicket?.botSpawnWeight) || 1;
  const tierAffinity = getBotTierAffinity(botTicket, targetTicket);
  const timeAffinity = getBotTimeAffinity(botTicket?.userId, now);
  const recentPenalty = getBotRecentAppearancePenalty(botTicket?.userId, targetTicket?.userId, now);
  return Math.max(0.001, baseWeight * tierAffinity * timeAffinity * recentPenalty);
}

function pickWeightedBotTicket(candidates, targetTicket = null, now = Date.now()) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const weighted = candidates.map((ticket) => ({
    ticket,
    weight: buildBotCandidateWeight(ticket, targetTicket, now),
  }));
  const total = weighted.reduce((acc, x) => acc + x.weight, 0);
  if (total <= 0) return randomFrom(candidates);
  let x = Math.random() * total;
  for (const entry of weighted) {
    x -= entry.weight;
    if (x <= 0) return entry.ticket;
  }
  return weighted[weighted.length - 1].ticket;
}

async function fetchAvailablePvpBotTicket(now = Date.now(), targetTicket = null) {
  if (!pvpBotEnabledRuntime) return null;
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT
         u.id,
         u.username,
         u.nickname,
         u.profile_avatar_key,
         u.bot_skill,
         u.bot_spawn_weight,
         u.is_bot,
         CASE WHEN u.placement_done = true AND COALESCE(u.placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN u.rating ELSE 0 END AS rating,
         ROW_NUMBER() OVER (
           ORDER BY
             CASE WHEN u.placement_done = true AND COALESCE(u.placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN u.rating ELSE 0 END DESC,
             u.rating_wins DESC,
             u.rating_games DESC,
             u.id ASC
         ) AS rating_rank
       FROM users u
     )
     SELECT id, username, nickname, bot_skill, bot_spawn_weight, rating, rating_rank, profile_avatar_key
     FROM ranked
     WHERE is_bot = true
       AND rating > 0`
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

  const candidates = [];
  for (const row of rows) {
    const difficulty = normalizeBotDifficulty(row?.bot_skill);
    if (PVP_BOT_EXCLUDE_EASY && difficulty === "easy") continue;
    const botId = Number(row.id);
    if (!Number.isInteger(botId)) continue;
    if (isUserInAnyRoom(botId)) continue;
    if (isBotBusyInMatch(botId)) continue;
    const ticket = createPvpBotTicket(row, now);
    if (ticket) candidates.push(ticket);
  }
  if (!candidates.length) return null;
  if (targetTicket) {
    const preferred = candidates.filter((bot) => canTierMatch(targetTicket, bot, now));
    if (preferred.length) {
      const selected = pickWeightedBotTicket(preferred, targetTicket, now);
      if (selected) markRecentBotAppearance(selected.userId, targetTicket.userId, now);
      return selected;
    }
  }
  const selected = pickWeightedBotTicket(candidates, targetTicket, now);
  if (selected) markRecentBotAppearance(selected.userId, targetTicket?.userId, now);
  return selected;
}

async function fetchUserRatingSnapshot(userId) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId)) return null;
  const { rows } = await pool.query(
    `SELECT ranked.rating, ranked.rank_pos
     FROM (
       SELECT
         u.id,
         CASE WHEN u.placement_done = true AND COALESCE(u.placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN u.rating ELSE 0 END AS rating,
         ROW_NUMBER() OVER (
           ORDER BY
             CASE WHEN u.placement_done = true AND COALESCE(u.placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN u.rating ELSE 0 END DESC,
             u.rating_wins DESC,
             u.rating_games DESC,
             u.id ASC
         ) AS rank_pos
       FROM users u
     ) ranked
     WHERE ranked.id = $1
     LIMIT 1`,
    [numericUserId]
  );
  if (!rows.length) return null;
  const rating = normalizeRatingValue(rows[0].rating);
  const rank = normalizeRatingRank(rows[0].rank_pos);
  return {
    rating,
    rank,
  };
}

function pickBotTargetSec(width, height, rawDifficulty = "normal", rawRating = 0) {
  const difficulty = normalizeBotDifficulty(rawDifficulty);
  const key = `${width}x${height}`;
  const bySize = BOT_SOLVE_TIME_RANGE_SEC[key];
  const getTierSpeedMultiplier = (rawRating) => {
    const rating = normalizeRatingValue(rawRating);
    if (rating >= 2500) return 0.84;
    if (rating >= 2000) return 0.88;
    if (rating >= 1500) return 0.92;
    return 1;
  };
  const applySpeedMultiplier = (targetSec, rawRating) => {
    const multiplier = getTierSpeedMultiplier(rawRating);
    return Math.max(1, Math.round(Number(targetSec) * multiplier));
  };
  if (bySize && Array.isArray(bySize[difficulty]) && bySize[difficulty].length === 2) {
    const [minSec, maxSec] = bySize[difficulty];
    return applySpeedMultiplier(randomInt(Number(minSec), Number(maxSec)), rawRating);
  }
  if (bySize && Array.isArray(bySize.normal) && bySize.normal.length === 2) {
    const [minSec, maxSec] = bySize.normal;
    return applySpeedMultiplier(randomInt(Number(minSec), Number(maxSec)), rawRating);
  }
  return applySpeedMultiplier(randomInt(120, 420), rawRating);
}

function getWinStreakBonus(nextStreak) {
  const streak = Number(nextStreak || 0);
  if (!Number.isInteger(streak) || streak < 2) return 0;
  for (const [minStreak, bonus] of WIN_STREAK_BONUS_TABLE) {
    if (streak >= minStreak) return Number(bonus || 0);
  }
  return 0;
}

function buildBotPairKey(aUserId, bUserId) {
  const a = Number(aUserId);
  const b = Number(bUserId);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return "";
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function pruneRecentBotPairs(now = Date.now()) {
  for (let i = pvpBotLadderRecentPairs.length - 1; i >= 0; i -= 1) {
    const item = pvpBotLadderRecentPairs[i];
    if (!item || now - Number(item.at || 0) > PVP_BOT_LADDER_RECENT_PAIR_TTL_MS) {
      pvpBotLadderRecentPairs.splice(i, 1);
    }
  }
  while (pvpBotLadderRecentPairs.length > PVP_BOT_LADDER_RECENT_PAIR_LIMIT) {
    pvpBotLadderRecentPairs.shift();
  }
}

function hasRecentBotPair(aUserId, bUserId, now = Date.now()) {
  pruneRecentBotPairs(now);
  const key = buildBotPairKey(aUserId, bUserId);
  if (!key) return false;
  return pvpBotLadderRecentPairs.some((item) => item.key === key);
}

function markRecentBotPair(aUserId, bUserId, now = Date.now()) {
  const key = buildBotPairKey(aUserId, bUserId);
  if (!key) return;
  pvpBotLadderRecentPairs.push({ key, at: now });
  pruneRecentBotPairs(now);
}

function pickWeightedBotCandidate(candidates, excludeIds = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const excludeSet = new Set((excludeIds || []).map((x) => Number(x)));
  const pool = candidates.filter((item) => !excludeSet.has(Number(item?.id)));
  if (!pool.length) return null;
  const total = pool.reduce((acc, item) => acc + Math.max(1, normalizeBotSpawnWeight(item?.bot_spawn_weight) || 1), 0);
  if (total <= 0) return randomFrom(pool);
  let x = Math.random() * total;
  for (const item of pool) {
    x -= Math.max(1, normalizeBotSpawnWeight(item?.bot_spawn_weight) || 1);
    if (x <= 0) return item;
  }
  return pool[pool.length - 1];
}

async function fetchAutomatedBotLadderCandidates() {
  const { rows } = await pool.query(
    `SELECT id, username, nickname, profile_avatar_key, bot_skill, bot_spawn_weight,
            rating, rating_games, rating_wins, rating_losses, win_streak_current, win_streak_best
     FROM users
     WHERE is_bot = true
       AND placement_done = true
       AND COALESCE(placement_version, 0) = $1
       AND rating > 0
     ORDER BY rating DESC, rating_games DESC, id ASC`,
    [CURRENT_PLACEMENT_VERSION]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username || ""),
    nickname: String(row.nickname || `bot-${row.id}`),
    profile_avatar_key: normalizeProfileAvatarKey(row.profile_avatar_key),
    bot_skill: normalizeBotDifficulty(row.bot_skill),
    bot_spawn_weight: normalizeBotSpawnWeight(row.bot_spawn_weight),
    rating: normalizeRatingValue(row.rating),
    rating_games: Number(row.rating_games || 0),
    rating_wins: Number(row.rating_wins || 0),
    rating_losses: Number(row.rating_losses || 0),
    win_streak_current: Number(row.win_streak_current || 0),
    win_streak_best: Number(row.win_streak_best || 0),
  }));
}

function chooseAutomatedBotLadderPair(bots, now = Date.now()) {
  if (!Array.isArray(bots) || bots.length < 2) return null;
  const ticketLikeAt = now - Math.max(PVP_BOT_LADDER_INTERVAL_MS * 2, 1000 * 60);
  const normalized = bots.map((bot) => ({
    ...bot,
    createdAt: ticketLikeAt,
  }));
  const anchor = pickWeightedBotCandidate(normalized);
  if (!anchor) return null;

  const strictPool = normalized.filter((candidate) => {
    if (Number(candidate.id) === Number(anchor.id)) return false;
    if (!canTierMatch(anchor, candidate, now)) return false;
    return !hasRecentBotPair(anchor.id, candidate.id, now);
  });
  const relaxedPool = normalized.filter((candidate) => {
    if (Number(candidate.id) === Number(anchor.id)) return false;
    return canTierMatch(anchor, candidate, now);
  });
  const fallbackPool = normalized.filter((candidate) => Number(candidate.id) !== Number(anchor.id));
  const opponent =
    pickWeightedBotCandidate(strictPool, [anchor.id]) ||
    pickWeightedBotCandidate(relaxedPool, [anchor.id]) ||
    pickWeightedBotCandidate(fallbackPool, [anchor.id]);
  if (!opponent) return null;
  return [anchor, opponent];
}

async function runAutomatedBotLadderMatch(now = Date.now()) {
  if (!PVP_BOT_LADDER_ENABLED || pvpBotLadderRunning) return null;
  pvpBotLadderRunning = true;
  try {
    const busyBotIds = new Set();
    for (const room of raceRooms.values()) {
      for (const p of room.players.values()) {
        if (p?.isBot && Number.isInteger(Number(p.userId))) busyBotIds.add(Number(p.userId));
      }
    }
    for (const match of pvpMatches.values()) {
      if (!match || match.state === "cancelled") continue;
      for (const p of match.players || []) {
        if (p?.isBot && Number.isInteger(Number(p.userId))) busyBotIds.add(Number(p.userId));
      }
    }

    const candidates = (await fetchAutomatedBotLadderCandidates()).filter(
      (bot) => Number.isInteger(bot.id) && !busyBotIds.has(bot.id)
    );
    if (candidates.length < 2) return null;

    const pair = chooseAutomatedBotLadderPair(candidates, now);
    if (!pair) return null;
    const [botA, botB] = pair;
    const sizeOptions = getPvpSizeOptionsForTickets(botA, botB);
    const pickedSize = randomFrom(sizeOptions);
    if (!Array.isArray(pickedSize) || pickedSize.length !== 2) return null;
    const [width, height] = pickedSize.map((v) => Number(v));
    const puzzle = await fetchRandomPuzzleForSize(width, height);
    if (!puzzle) return null;

    const aSec = pickBotTargetSec(width, height, botA.bot_skill, botA.rating);
    const bSec = pickBotTargetSec(width, height, botB.bot_skill, botB.rating);
    let winner = botA;
    let loser = botB;
    let winnerSec = aSec;
    let loserSec = bSec;
    if (bSec < aSec || (bSec === aSec && Math.random() < 0.5)) {
      winner = botB;
      loser = botA;
      winnerSec = bSec;
      loserSec = aSec;
    }

    const winnerRating = normalizeRatingValue(winner.rating);
    const loserRating = normalizeRatingValue(loser.rating);
    const ratingDiff = loserRating - winnerRating;
    const winnerDeltaBase = Math.max(12, Math.min(48, Math.round(RATING_WIN_BASE + ratingDiff / 130)));
    const loserDelta = Math.max(6, Math.min(28, Math.round(RATING_LOSS_BASE + (winnerRating - loserRating) / 220)));
    const winnerNextStreak = Math.max(0, Number(winner.win_streak_current || 0)) + 1;
    const winnerStreakBonus = getWinStreakBonus(winnerNextStreak);
    const winnerDelta = Math.max(1, winnerDeltaBase + winnerStreakBonus);
    const winnerNext = Math.max(0, Math.min(5000, winnerRating + winnerDelta));
    const loserNext = Math.max(0, Math.min(5000, loserRating - loserDelta));

    const roomCode = `B${randomCode()}${randomCode()}`.slice(0, 12);
    const roomCreatedAtMs = now - randomInt(8000, 18000);
    const gameStartAtMs = roomCreatedAtMs + randomInt(1500, 5000);
    const finishedAtMs = gameStartAtMs + loserSec * 1000;
    const winnerPlayerId = `bot-${winner.id}`;
    const loserPlayerId = `bot-${loser.id}`;
    const rankings = [
      { rank: 1, playerId: winnerPlayerId, nickname: winner.nickname, elapsedSec: winnerSec, status: "finished" },
      { rank: 2, playerId: loserPlayerId, nickname: loser.nickname, elapsedSec: loserSec, status: "finished" },
    ];
    const playersPayload = [
      {
        userId: winner.id,
        playerId: winnerPlayerId,
        nickname: winner.nickname,
        isBot: true,
        elapsedSec: winnerSec,
        rank: 1,
        status: "finished",
        outcome: "win",
        disconnectedAt: null,
      },
      {
        userId: loser.id,
        playerId: loserPlayerId,
        nickname: loser.nickname,
        isBot: true,
        elapsedSec: loserSec,
        rank: 2,
        status: "finished",
        outcome: "loss",
        disconnectedAt: null,
      },
    ];

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE users
         SET rating = $2,
             rating_games = rating_games + 1,
             rating_wins = rating_wins + 1,
             win_streak_current = $3,
             win_streak_best = GREATEST(win_streak_best, $3)
         WHERE id = $1`,
        [winner.id, winnerNext, winnerNextStreak]
      );
      await pool.query(
        `UPDATE users
         SET rating = $2,
             rating_games = rating_games + 1,
             rating_losses = rating_losses + 1,
             win_streak_current = 0
         WHERE id = $1`,
        [loser.id, loserNext]
      );
      await pool.query(
        `INSERT INTO race_match_logs (
          room_code, game_start_at_ms, room_created_at_ms, mode, puzzle_id, width, height,
          winner_user_id, winner_nickname, player_count, participants, rankings_json, players_json, finished_at_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14
        )
        ON CONFLICT (room_code, game_start_at_ms) DO NOTHING`,
        [
          roomCode,
          gameStartAtMs,
          roomCreatedAtMs,
          "pvp_bot_auto",
          Number(puzzle.id),
          width,
          height,
          winner.id,
          winner.nickname,
          2,
          `${winner.nickname}, ${loser.nickname}`,
          JSON.stringify(rankings),
          JSON.stringify(playersPayload),
          finishedAtMs,
        ]
      );
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }

    markRecentBotPair(botA.id, botB.id, now);
    console.log(
      `[auto-bot-match] ${winner.nickname} beat ${loser.nickname} (${width}x${height}, +${winnerDelta}/-${loserDelta})`
    );
    return {
      winner: winner.nickname,
      loser: loser.nickname,
      width,
      height,
      winnerDelta,
      loserDelta,
    };
  } finally {
    pvpBotLadderRunning = false;
  }
}

function startPvpBotLadderLoop() {
  if (!PVP_BOT_LADDER_ENABLED) return;
  if (pvpBotLadderTimer) return;
  pvpBotLadderTimer = setInterval(async () => {
    try {
      await runAutomatedBotLadderMatch(Date.now());
    } catch (err) {
      console.error("auto bot match failed:", err.message || err);
    }
  }, PVP_BOT_LADDER_INTERVAL_MS);
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
    banStartAt: match.banStartAt || null,
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
      rating: normalizeRatingValue(p.rating),
      ratingRank: normalizeRatingRank(p.ratingRank),
      profileAvatarKey: normalizeProfileAvatarKey(p.profileAvatarKey),
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
    matchLogSaved: false,
    matchLogSaving: false,
    bestReplaySaved: false,
    bestReplaySaving: false,
    chatMessages: [],
    reactionEvents: [],
    players: new Map(),
  };

  const initialBits = emptyBitsBase64(puzzle.width, puzzle.height);

  for (const p of match.players) {
    const playerId = randomPlayerId();
    playerIdByUserId.set(p.userId, playerId);
    room.players.set(playerId, {
      playerId,
      userId: p.userId,
      nickname: p.nickname,
      isBot: p.isBot === true,
      botDifficulty: p.isBot ? normalizeBotDifficulty(p.botDifficulty) : null,
      botTargetSec: p.isBot ? pickBotTargetSec(puzzle.width, puzzle.height, p.botDifficulty, p.rating) : null,
      joinedAt: nowIso,
      finishedAt: null,
      elapsedSec: null,
      isReady: true,
      disconnectedAt: null,
      correctAnswerCells: 0,
      lastSeenAt: now,
      lastMoveAt: now + COUNTDOWN_MS,
      loseReason: null,
      progressFrames: [{ atMs: 0, bits: initialBits }],
      lastReplayBits: initialBits,
      lastReplayFrameAt: 0,
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
      match.banStartAt = now + PVP_SHOWDOWN_MS;
      match.banDeadlineAt = match.banStartAt + PVP_BAN_MS;
      match.updatedAt = now;
    } else if (now >= match.acceptDeadlineAt) {
      cancelPvpMatch(match, "accept_timeout");
    }
  }

  if (match.state === "ban") {
    const banStartAt = Number(match.banStartAt || 0);
    if (banStartAt && now < banStartAt) return;
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
  if (!room) return;
  if (room.state === "countdown" && room.gameStartAt && Date.now() >= room.gameStartAt) {
    const gameStartAt = Number(room.gameStartAt || Date.now());
    room.state = "playing";
    for (const p of room.players.values()) {
      if (!Number.isFinite(Number(p.lastMoveAt)) || Number(p.lastMoveAt) < gameStartAt) {
        p.lastMoveAt = gameStartAt;
      }
      p.loseReason = null;
    }
  }
}

function pickWinnerPlayer(room) {
  if (!room) return null;
  if (room.winnerPlayerId && room.players.has(room.winnerPlayerId)) {
    return room.players.get(room.winnerPlayerId);
  }
  const finished = getFinishedPlayers(room);
  const nonForfeit = finished.find((p) => !p.loseReason);
  return nonForfeit || finished[0] || null;
}

function maybeFinalizeRoom(room) {
  if (!room || room.state !== "playing") return false;
  if (!shouldFinishRace(room)) return false;
  const winner = pickWinnerPlayer(room);
  room.winnerPlayerId = winner ? winner.playerId : null;
  room.state = "finished";
  void applyRatedResultIfNeeded(room);
  void persistMatchLogIfNeeded(room);
  void persistBestReplayRecordIfNeeded(room);
  return true;
}

function applyInactiveAutoLoss(room, now = Date.now()) {
  if (!room || room.state !== "playing") return false;
  if (room.mode !== "pvp_ranked" && room.mode !== "pvp_bot") return false;
  const gameStartAt = Number(room.gameStartAt || now);
  let changed = false;

  for (const p of room.players.values()) {
    if (p.isBot) continue;
    if (p.disconnectedAt || Number.isInteger(p.elapsedSec)) continue;
    const lastMoveAt = Number.isFinite(Number(p.lastMoveAt)) ? Number(p.lastMoveAt) : gameStartAt;
    if (now - lastMoveAt < RACE_INACTIVITY_TIMEOUT_MS) continue;

    p.elapsedSec = Math.max(0, Math.floor((now - gameStartAt) / 1000));
    p.finishedAt = new Date(now).toISOString();
    p.loseReason = "inactive_timeout";
    p.isReady = false;
    changed = true;
  }

  if (!changed) return false;

  const active = Array.from(room.players.values()).filter((p) => !p.disconnectedAt && !Number.isInteger(p.elapsedSec));
  const alive = active.filter((p) => !p.loseReason);
  if (alive.length === 1) {
    room.winnerPlayerId = alive[0].playerId;
  }

  maybeFinalizeRoom(room);
  return true;
}

function advanceBotPlayers(room, now = Date.now()) {
  if (!room || room.state !== "playing") return false;
  const gameStartAt = Number(room.gameStartAt || now);
  let changed = false;
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    p.lastSeenAt = now;
    if (p.disconnectedAt || Number.isInteger(p.elapsedSec)) continue;
    const targetSec = Number(p.botTargetSec || pickBotTargetSec(room.width, room.height, p.botDifficulty, p.rating));
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
      p.loseReason = null;
      changed = true;
    }
  }
  if (maybeFinalizeRoom(room)) {
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

  if (maybeFinalizeRoom(room)) {
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
      const aForfeit = Boolean(a.loseReason);
      const bForfeit = Boolean(b.loseReason);
      if (aForfeit !== bForfeit) return aForfeit ? 1 : -1;
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
    status: p.loseReason === "inactive_timeout" ? "timeout" : "finished",
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

async function applyLeaveRoomPenaltyIfNeeded(room, player) {
  return { applied: false, points: 0 };
}

async function applyRatedResultIfNeeded(room) {
  if (!room || room.state !== "finished") return;
  if (room.mode !== "pvp_ranked" && room.mode !== "pvp_bot") return;
  if (room.ratedResultApplied === true || room.ratedResultApplying === true) return;
  if (!Array.isArray(room.ratedUserIds) || room.ratedUserIds.length !== 2) return;

  const [userA, userB] = room.ratedUserIds.map((v) => Number(v)).filter((v) => Number.isInteger(v));
  if (!Number.isInteger(userA) || !Number.isInteger(userB) || userA === userB) return;

  const winnerPlayer = pickWinnerPlayer(room);
  if (!winnerPlayer || !Number.isInteger(Number(winnerPlayer.userId))) return;

  const winnerUserId = Number(winnerPlayer.userId);
  const loserUserId = winnerUserId === userA ? userB : winnerUserId === userB ? userA : null;
  if (!loserUserId) return;

  room.ratedResultApplying = true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, rating, rating_games, rating_wins, rating_losses, win_streak_current, win_streak_best
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

    const winnerRating = normalizeRatingValue(winner.rating);
    const loserRating = normalizeRatingValue(loser.rating);
    const ratingDiff = loserRating - winnerRating;
    const winnerDeltaBase = Math.max(12, Math.min(48, Math.round(RATING_WIN_BASE + ratingDiff / 130)));
    const loserDelta = Math.max(6, Math.min(28, Math.round(RATING_LOSS_BASE + (winnerRating - loserRating) / 220)));
    const winnerNextStreak = Math.max(0, Number(winner.win_streak_current || 0)) + 1;
    const winnerStreakBonus = getWinStreakBonus(winnerNextStreak);
    const winnerDelta = Math.max(1, winnerDeltaBase + winnerStreakBonus);
    const winnerNext = Math.max(0, Math.min(5000, winnerRating + winnerDelta));
    const loserNext = Math.max(0, Math.min(5000, loserRating - loserDelta));

    await client.query(
      `UPDATE users
       SET rating = $2,
           rating_games = rating_games + 1,
           rating_wins = rating_wins + 1,
           win_streak_current = $3,
           win_streak_best = GREATEST(win_streak_best, $3)
       WHERE id = $1`,
      [winnerUserId, winnerNext, winnerNextStreak]
    );
    await client.query(
      `UPDATE users
       SET rating = $2,
           rating_games = rating_games + 1,
           rating_losses = rating_losses + 1,
           win_streak_current = 0
       WHERE id = $1`,
      [loserUserId, loserNext]
    );
    await client.query("COMMIT");

    room.ratedResultApplied = true;
    room.ratedResult = {
      winnerUserId,
      loserUserId,
      winnerDelta: winnerNext - winnerRating,
      loserDelta: loserNext - loserRating,
      winnerStreak: winnerNextStreak,
      winnerStreakBonus,
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

function getRoomMode(room) {
  const mode = String(room?.mode || "").trim().toLowerCase();
  return mode || "race_room";
}

async function persistMatchLogIfNeeded(room) {
  if (!room || room.state !== "finished") return;
  if (room.matchLogSaved === true || room.matchLogSaving === true) return;

  const mode = getRoomMode(room);
  if (mode === "single") return;

  const gameStartAtMs = Number(room.gameStartAt || room.countdownStartAt || room.createdAt || Date.now());
  const roomCreatedAtMs = Number(room.createdAt || gameStartAtMs || Date.now());
  const finishedAtMs = Date.now();

  room.matchLogSaving = true;
  try {
    const rankings = buildRankings(room);
    const rankingByPlayerId = new Map(rankings.map((r) => [String(r.playerId || ""), r]));
    const winnerPlayer = pickWinnerPlayer(room);
    const winnerUserId =
      winnerPlayer && Number.isInteger(Number(winnerPlayer.userId)) ? Number(winnerPlayer.userId) : null;
    const winnerNickname = winnerPlayer ? String(winnerPlayer.nickname || "") : null;

    const playersPayload = Array.from(room.players.values())
      .sort((a, b) => (String(a.joinedAt || "") > String(b.joinedAt || "") ? 1 : -1))
      .map((p) => {
        const rankInfo = rankingByPlayerId.get(String(p.playerId || "")) || null;
        const status = String(rankInfo?.status || (p.disconnectedAt ? "left" : "dnf"));
        const isWinner = room.winnerPlayerId && p.playerId === room.winnerPlayerId;
        const outcome = isWinner ? "win" : status === "finished" ? "loss" : status;
        return {
          userId: Number.isInteger(Number(p.userId)) ? Number(p.userId) : null,
          playerId: String(p.playerId || ""),
          nickname: String(p.nickname || ""),
          isBot: p.isBot === true,
          elapsedSec: Number.isInteger(Number(p.elapsedSec)) ? Number(p.elapsedSec) : null,
          rank: Number.isInteger(Number(rankInfo?.rank)) ? Number(rankInfo.rank) : null,
          status,
          outcome,
          disconnectedAt: p.disconnectedAt || null,
        };
      });

    const participants = playersPayload.map((p) => p.nickname).filter(Boolean).join(", ");
    await pool.query(
      `INSERT INTO race_match_logs (
        room_code, game_start_at_ms, room_created_at_ms, mode, puzzle_id, width, height,
        winner_user_id, winner_nickname, player_count, participants, rankings_json, players_json, finished_at_ms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14
      )
      ON CONFLICT (room_code, game_start_at_ms) DO NOTHING`,
      [
        String(room.roomCode || ""),
        gameStartAtMs,
        roomCreatedAtMs,
        mode,
        Number.isInteger(Number(room.puzzleId)) ? Number(room.puzzleId) : null,
        Number.isInteger(Number(room.width)) ? Number(room.width) : null,
        Number.isInteger(Number(room.height)) ? Number(room.height) : null,
        winnerUserId,
        winnerNickname,
        playersPayload.length,
        participants,
        JSON.stringify(rankings),
        JSON.stringify(playersPayload),
        finishedAtMs,
      ]
    );
    room.matchLogSaved = true;
  } catch (err) {
    console.error("failed to persist race_match_logs:", err.message || err);
  } finally {
    room.matchLogSaving = false;
  }
}

async function persistBestReplayRecordIfNeeded(room) {
  if (!room || room.state !== "finished") return;
  if (room.bestReplaySaved === true || room.bestReplaySaving === true) return;
  if (!Number.isInteger(Number(room.width)) || !Number.isInteger(Number(room.height))) return;
  if (!Number.isInteger(Number(room.puzzleId))) return;
  if (!Number.isFinite(Number(room.gameStartAt || room.countdownStartAt || room.createdAt))) return;

  room.bestReplaySaving = true;
  const width = Number(room.width);
  const height = Number(room.height);
  const puzzleId = Number(room.puzzleId);
  const gameStartAtMs = Number(room.gameStartAt || room.countdownStartAt || room.createdAt || Date.now());
  const sizeLockKey = width * 1000 + height;
  const client = await pool.connect();
  try {
    const finishers = Array.from(room.players.values())
      .map((p) => {
        const elapsedSec = Number.isInteger(Number(p.elapsedSec)) ? Number(p.elapsedSec) : null;
        const finishedAtMsParsed = Date.parse(String(p.finishedAt || ""));
        const finishedAtMs = Number.isFinite(finishedAtMsParsed)
          ? finishedAtMsParsed
          : gameStartAtMs + Math.max(1, Number(elapsedSec || 0)) * 1000;
        const elapsedMs =
          Number.isFinite(finishedAtMs) && finishedAtMs > gameStartAtMs
            ? Math.max(1, finishedAtMs - gameStartAtMs)
            : Math.max(1, Number(elapsedSec || 0) * 1000);
        return { player: p, elapsedSec, elapsedMs, finishedAtMs };
      })
      .filter((f) => {
        const p = f.player;
        if (!Number.isInteger(Number(p.userId))) return false;
        if (p.isBot === true) return false;
        if (!Number.isInteger(Number(f.elapsedSec))) return false;
        if (Number(f.elapsedSec) <= 0) return false;
        if (p.loseReason) return false;
        return true;
      })
      .sort((a, b) => Number(a.elapsedMs) - Number(b.elapsedMs));
    if (!finishers.length) {
      room.bestReplaySaved = true;
      return;
    }

    const userIds = finishers.map((f) => Number(f.player.userId));
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [sizeLockKey]);

    const { rows: users } = await client.query(
      `SELECT id, is_bot, nickname FROM users WHERE id = ANY($1::bigint[])`,
      [userIds]
    );
    const userMap = new Map(users.map((u) => [Number(u.id), u]));
    const solvedBits = room.solutionBits ? Buffer.from(room.solutionBits).toString("base64") : null;
    let hallTopRows = [];
    {
      const { rows } = await client.query(
        `SELECT
           id,
           elapsed_sec,
           game_start_at_ms,
           finished_at_ms,
           GREATEST(
             1,
             CASE
               WHEN finished_at_ms > game_start_at_ms THEN (finished_at_ms - game_start_at_ms)
               ELSE (elapsed_sec * 1000)
             END
           ) AS elapsed_ms
         FROM hall_replay_records
         WHERE width = $1 AND height = $2
         ORDER BY elapsed_ms ASC, game_start_at_ms ASC, id ASC
         LIMIT $3`,
        [width, height, HALL_TOP_LIMIT]
      );
      hallTopRows = rows.map((r) => ({
        id: Number(r.id),
        elapsedSec: Number(r.elapsed_sec),
        elapsedMs: Number(r.elapsed_ms || Number(r.elapsed_sec || 0) * 1000),
        gameStartAtMs: Number(r.game_start_at_ms),
      }));
    }

    for (const finisher of finishers) {
      const p = finisher.player;
      const userInfo = userMap.get(Number(p.userId));
      if (!userInfo || userInfo.is_bot === true) continue;
      const elapsedSec = Number(finisher.elapsedSec);
      const elapsedMs = Number(finisher.elapsedMs);
      const finishedAtMs = Number(finisher.finishedAtMs);

      let frames = sanitizeReplayFrames(p.progressFrames);
      if (!frames.length) {
        frames = [{ atMs: 0, bits: emptyBitsBase64(width, height) }];
      }
      if (solvedBits) {
        const finalAtMs = Math.max(0, elapsedMs);
        const last = frames[frames.length - 1] || null;
        if (!last || last.bits !== solvedBits || Number(last.atMs || 0) < finalAtMs) {
          frames.push({ atMs: finalAtMs, bits: solvedBits });
        }
      }
      frames = downsampleReplayFrames(frames, REPLAY_MAX_FRAMES);
      if (!frames.length) continue;

      await client.query(
        `INSERT INTO best_replay_records (
          width, height, user_id, nickname, elapsed_sec, puzzle_id, game_start_at_ms, frames_json, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, now()
        )
        ON CONFLICT (width, height) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            nickname = EXCLUDED.nickname,
            elapsed_sec = EXCLUDED.elapsed_sec,
            puzzle_id = EXCLUDED.puzzle_id,
            game_start_at_ms = EXCLUDED.game_start_at_ms,
            frames_json = EXCLUDED.frames_json,
            updated_at = now()
        WHERE (
          EXCLUDED.elapsed_sec < best_replay_records.elapsed_sec
          OR (
            EXCLUDED.elapsed_sec = best_replay_records.elapsed_sec
            AND EXCLUDED.game_start_at_ms < best_replay_records.game_start_at_ms
          )
        )`,
        [
          width,
          height,
          Number(p.userId),
          String(p.nickname || userInfo.nickname || ""),
          elapsedSec,
          puzzleId,
          gameStartAtMs,
          JSON.stringify(frames),
        ]
      );

      let shouldInsertHall = false;
      if (hallTopRows.length < HALL_TOP_LIMIT) {
        shouldInsertHall = true;
      } else {
        const worst = hallTopRows[hallTopRows.length - 1];
        shouldInsertHall =
          elapsedMs < worst.elapsedMs ||
          (elapsedMs === worst.elapsedMs && gameStartAtMs < worst.gameStartAtMs);
      }
      if (!shouldInsertHall) continue;

      await client.query(
        `INSERT INTO hall_replay_records (
          width, height, user_id, nickname, elapsed_sec, puzzle_id, game_start_at_ms, finished_at_ms, frames_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
        )
        ON CONFLICT (width, height, user_id, puzzle_id, game_start_at_ms) DO NOTHING`,
        [
          width,
          height,
          Number(p.userId),
          String(p.nickname || userInfo.nickname || ""),
          elapsedSec,
          puzzleId,
          gameStartAtMs,
          finishedAtMs,
          JSON.stringify(frames),
        ]
      );

      await client.query(
        `DELETE FROM hall_replay_records h
         WHERE h.width = $1
           AND h.height = $2
           AND h.id NOT IN (
             SELECT x.id
             FROM hall_replay_records x
             WHERE x.width = $1
               AND x.height = $2
             ORDER BY
               GREATEST(
                 1,
                 CASE
                   WHEN x.finished_at_ms > x.game_start_at_ms THEN (x.finished_at_ms - x.game_start_at_ms)
                   ELSE (x.elapsed_sec * 1000)
                 END
               ) ASC,
               x.game_start_at_ms ASC,
               x.id ASC
             LIMIT $3
           )`,
        [width, height, HALL_TOP_LIMIT]
      );

      const { rows: hallRowsNext } = await client.query(
        `SELECT
           id,
           elapsed_sec,
           game_start_at_ms,
           finished_at_ms,
           GREATEST(
             1,
             CASE
               WHEN finished_at_ms > game_start_at_ms THEN (finished_at_ms - game_start_at_ms)
               ELSE (elapsed_sec * 1000)
             END
           ) AS elapsed_ms
         FROM hall_replay_records
         WHERE width = $1 AND height = $2
         ORDER BY elapsed_ms ASC, game_start_at_ms ASC, id ASC
         LIMIT $3`,
        [width, height, HALL_TOP_LIMIT]
      );
      hallTopRows = hallRowsNext.map((r) => ({
        id: Number(r.id),
        elapsedSec: Number(r.elapsed_sec),
        elapsedMs: Number(r.elapsed_ms || Number(r.elapsed_sec || 0) * 1000),
        gameStartAtMs: Number(r.game_start_at_ms),
      }));
    }

    await client.query("COMMIT");
    room.bestReplaySaved = true;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    console.error("failed to persist best_replay_records:", err.message || err);
  } finally {
    client.release();
    room.bestReplaySaving = false;
  }
}

function roomPublicState(room) {
  syncRoomState(room);
  const now = Date.now();
  advanceBotPlayers(room, now);
  applyInactiveAutoLoss(room, now);
  removeStalePlayers(room, now);
  void applyRatedResultIfNeeded(room);
  void persistMatchLogIfNeeded(room);
  void persistBestReplayRecordIfNeeded(room);
  if (!Array.isArray(room.reactionEvents)) {
    room.reactionEvents = [];
  } else {
    room.reactionEvents = room.reactionEvents.filter((e) => now - e.ts <= 6000);
  }
  const rankings = buildRankings(room);
  const players = Array.from(room.players.values())
    .map((p) => ({
      playerId: p.playerId,
      userId: Number(p.userId),
      nickname: p.nickname,
      profileAvatarKey: normalizeProfileAvatarKey(p.profileAvatarKey),
      joinedAt: p.joinedAt,
      finishedAt: p.finishedAt,
      elapsedSec: p.elapsedSec,
      isReady: p.isReady,
      disconnectedAt: p.disconnectedAt || null,
      loseReason: p.loseReason || null,
      lastMoveAt: Number.isFinite(Number(p.lastMoveAt)) ? Number(p.lastMoveAt) : null,
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
    ratedResultApplied: Boolean(room.ratedResultApplied),
    ratedResultApplying: Boolean(room.ratedResultApplying),
    inactivityTimeoutMs: RACE_INACTIVITY_TIMEOUT_MS,
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
  if (Math.random() < 0.5) {
    maybeMatchWaitingTicketsWithHuman(now);
    await maybeMatchWaitingTicketsWithBot(now);
  } else {
    await maybeMatchWaitingTicketsWithBot(now);
    maybeMatchWaitingTicketsWithHuman(now);
  }
  for (const room of raceRooms.values()) {
    syncRoomState(room);
    advanceBotPlayers(room, now);
    applyInactiveAutoLoss(room, now);
  }
}, 1000);

setInterval(async () => {
  try {
    await pool.query(`DELETE FROM user_sessions WHERE expires_at <= now()`);
  } catch {
    // ignore cleanup failures
  }
}, 1000 * 60 * 30);

function parseEnabledToggle(raw) {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["1", "true", "on", "yes", "enable", "enabled"].includes(v)) return true;
  if (["0", "false", "off", "no", "disable", "disabled"].includes(v)) return false;
  return null;
}

function isAdminToggleAuthorized(req) {
  if (!ADMIN_API_KEY) return true;
  const headerKey = String(req.headers["x-admin-key"] || "").trim();
  const bodyKey = String(req.body?.adminKey || "").trim();
  const queryKey = String(req.query?.adminKey || "").trim();
  const key = headerKey || bodyKey || queryKey;
  return key === ADMIN_API_KEY;
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/admin/pvp-bot", (req, res) => {
  if (!isAdminToggleAuthorized(req)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  return res.json({ ok: true, enabled: pvpBotEnabledRuntime });
});

app.post("/admin/pvp-bot", async (req, res) => {
  if (!isAdminToggleAuthorized(req)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  const enabled = parseEnabledToggle(req.body?.enabled ?? req.query?.enabled);
  if (enabled == null) {
    return res.status(400).json({
      ok: false,
      error: "enabled must be one of: true/false, on/off, 1/0",
    });
  }
  pvpBotEnabledRuntime = enabled;
  if (enabled) {
    try {
      await ensureBotUsers();
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || "Failed to enable bot matchmaking" });
    }
  }
  return res.json({ ok: true, enabled: pvpBotEnabledRuntime });
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
       RETURNING id, username, nickname, rating, rating_games, rating_wins, rating_losses,
                 win_streak_current, win_streak_best, profile_avatar_key,
                 ui_lang, ui_theme, ui_sound_on, ui_sound_volume,
                 placement_done, placement_rating, placement_tier_key, placement_version,
                 placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec`,
      [username, nickname, passwordHash]
    );
    const user = rows[0];
    const token = await createSessionForUser(user.id);
    return res.json({ ok: true, token, user: buildClientUser(user) });
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
      `SELECT id, username, nickname, password_hash, rating, rating_games, rating_wins, rating_losses,
              win_streak_current, win_streak_best, profile_avatar_key,
              ui_lang, ui_theme, ui_sound_on, ui_sound_volume,
              placement_done, placement_rating, placement_tier_key, placement_version,
              placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec
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
      user: buildClientUser(user),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  return res.json({
    ok: true,
    user: buildClientUser(req.authUser),
  });
});

app.get("/vote/current", requireAuth, async (req, res) => {
  try {
    const vote = await buildActiveSiteVotePayloadForUser(req.authUser.id);
    return res.json({ ok: true, vote });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/vote/current", requireAuth, async (req, res) => {
  const optionKey = String(req.body?.optionKey || "").trim();
  if (!ACTIVE_SITE_VOTE_OPTION_KEYS.includes(optionKey)) {
    return res.status(400).json({ ok: false, error: "Invalid vote option" });
  }
  try {
    await pool.query(
      `INSERT INTO site_vote_responses (vote_key, user_id, option_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (vote_key, user_id) DO NOTHING`,
      [ACTIVE_SITE_VOTE.key, Number(req.authUser.id), optionKey]
    );
    const vote = await buildActiveSiteVotePayloadForUser(req.authUser.id);
    return res.json({
      ok: true,
      alreadyVoted: vote.votedOptionKey !== optionKey,
      vote,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const updateAuthPreferences = async (req, res) => {
  const uiLang = normalizeUiLang(req.body?.ui_lang);
  const uiTheme = normalizeUiTheme(req.body?.ui_theme);
  const uiSoundVolume = normalizeUiSoundVolume(
    req.body?.ui_sound_volume,
    req.body?.ui_sound_on
  );
  const uiSoundOn = uiSoundVolume > 0;
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET ui_lang = $2,
           ui_theme = $3,
           ui_sound_on = $4,
           ui_sound_volume = $5
       WHERE id = $1
       RETURNING id, username, nickname, rating, rating_games, rating_wins, rating_losses,
                 win_streak_current, win_streak_best, profile_avatar_key,
                 ui_lang, ui_theme, ui_sound_on, ui_sound_volume,
                 placement_done, placement_rating, placement_tier_key, placement_version,
                 placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec`,
      [Number(req.authUser.id), uiLang, uiTheme, uiSoundOn, uiSoundVolume]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    return res.json({ ok: true, user: buildClientUser(rows[0]) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

app.put("/auth/preferences", requireAuth, updateAuthPreferences);
// Compatibility routes for older/broken clients sending a different path or method.
app.put("/auth", requireAuth, updateAuthPreferences);
app.post("/auth/preferences", requireAuth, updateAuthPreferences);

app.get("/profile/me", requireAuth, async (req, res) => {
  try {
    const profile = await buildUserProfilePayload(req.authUser.id, { includeUsername: true });
    if (!profile) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    return res.json({ ok: true, profile });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/profile/me", requireAuth, async (req, res) => {
  const requestedKey = normalizeProfileAvatarKey(req.body?.profileAvatarKey);
  try {
    const currentProfile = await buildUserProfilePayload(req.authUser.id, { includeUsername: true });
    if (!currentProfile) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const isDefault = DEFAULT_PROFILE_AVATAR_KEYS.includes(requestedKey);
    const isUnlockedSpecial = Array.isArray(currentProfile.unlockedSpecialAvatarKeys)
      && currentProfile.unlockedSpecialAvatarKeys.includes(requestedKey);
    if (!isDefault && !isUnlockedSpecial) {
      return res.status(403).json({ ok: false, error: "Avatar is locked" });
    }
    const { rows } = await pool.query(
      `UPDATE users
       SET profile_avatar_key = $2
       WHERE id = $1
       RETURNING id, username, nickname, rating, rating_games, rating_wins, rating_losses,
                 win_streak_current, win_streak_best, profile_avatar_key,
                 ui_lang, ui_theme, ui_sound_on, ui_sound_volume,
                 placement_done, placement_rating, placement_tier_key, placement_version,
                 placement_completed_at_ms, placement_solved_sequential, placement_elapsed_sec`,
      [Number(req.authUser.id), requestedKey]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    propagateProfileAvatarSelection(req.authUser.id, requestedKey);
    const profile = await buildUserProfilePayload(req.authUser.id, { includeUsername: true });
    return res.json({ ok: true, user: buildClientUser(rows[0]), profile });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/placement/complete", requireAuth, async (req, res) => {
  const results = Array.isArray(req.body?.results) ? req.body.results : null;
  const elapsedSec = Number(req.body?.elapsedSec);
  const currentStageProgress = Number(req.body?.currentStageProgress ?? 0);
  if (!results || !Number.isFinite(elapsedSec)) {
    return res.status(400).json({ ok: false, error: "results and elapsedSec are required" });
  }
  try {
    const persisted = await persistPlacementResultForUser(
      req.authUser.id,
      results,
      elapsedSec,
      currentStageProgress
    );
    if (!persisted.user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    return res.json({
      ok: true,
      placement: persisted.placement,
      user: buildClientUser(persisted.user),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/profiles/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid userId" });
  }
  try {
    const profile = await buildUserProfilePayload(userId, { includeUsername: false });
    if (!profile) {
      return res.status(404).json({ ok: false, error: "Profile not found" });
    }
    return res.json({ ok: true, profile });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
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
  const legacyView = String(req.query?.view || "").trim().toLowerCase() === "legacy";
  try {
    const authUser = await getAuthUserFromReq(req);
    const listSql = legacyView
      ? `SELECT id, username, nickname, is_bot, rating, rating_games, rating_wins, rating_losses,
                win_streak_current, win_streak_best, profile_avatar_key, placement_done
         FROM users
         ORDER BY rating DESC, rating_wins DESC, rating_games DESC, id ASC
         LIMIT $1 OFFSET $2`
      : `SELECT id, username, nickname, is_bot,
                CASE WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN rating ELSE 0 END AS rating,
                rating_games, rating_wins, rating_losses,
                win_streak_current, win_streak_best, profile_avatar_key, placement_done
         FROM users
         ORDER BY
           CASE WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN rating ELSE 0 END DESC,
           rating_wins DESC,
           rating_games DESC,
           id ASC
         LIMIT $1 OFFSET $2`;
    const { rows } = await pool.query(listSql, [limit, offset]);
    let myRank = null;
    if (authUser && Number.isInteger(Number(authUser.id))) {
      const rankSql = legacyView
        ? `SELECT ranked.rank_pos
           FROM (
             SELECT id, ROW_NUMBER() OVER (ORDER BY rating DESC, rating_wins DESC, rating_games DESC, id ASC) AS rank_pos
             FROM users
           ) AS ranked
           WHERE ranked.id = $1
           LIMIT 1`
        : `SELECT ranked.rank_pos
           FROM (
             SELECT id, ROW_NUMBER() OVER (
               ORDER BY
                 CASE WHEN placement_done = true AND COALESCE(placement_version, 0) = ${CURRENT_PLACEMENT_VERSION} THEN rating ELSE 0 END DESC,
                 rating_wins DESC,
                 rating_games DESC,
                 id ASC
             ) AS rank_pos
             FROM users
           ) AS ranked
           WHERE ranked.id = $1
           LIMIT 1`;
      const { rows: rankRows } = await pool.query(rankSql, [Number(authUser.id)]);
      if (rankRows.length) {
        myRank = Number(rankRows[0].rank_pos);
      }
    }
    const { rows: totalRows } = await pool.query(`SELECT COUNT(*)::int AS total_users FROM users`);
    const totalUsers = totalRows.length ? Number(totalRows[0].total_users) : rows.length;
    return res.json({
      ok: true,
      users: rows,
      myRank,
      myUserId: authUser ? Number(authUser.id) : null,
      totalUsers,
      view: legacyView ? "legacy" : "current",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/replays/best", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.width, r.height, r.user_id, r.nickname, r.elapsed_sec, r.puzzle_id, r.game_start_at_ms,
              EXTRACT(EPOCH FROM r.updated_at) * 1000 AS updated_at_ms
       FROM best_replay_records r
       JOIN users u ON u.id = r.user_id
       WHERE u.is_bot = false
         AND r.elapsed_sec > 0
       ORDER BY r.width ASC, r.height ASC`
    );
    return res.json({
      ok: true,
      records: rows.map((r) => ({
        width: Number(r.width),
        height: Number(r.height),
        sizeKey: `${Number(r.width)}x${Number(r.height)}`,
        userId: Number(r.user_id),
        nickname: String(r.nickname || ""),
        elapsedSec: Number(r.elapsed_sec),
        puzzleId: Number(r.puzzle_id),
        gameStartAtMs: Number(r.game_start_at_ms),
        updatedAtMs: Number(r.updated_at_ms || 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/replays/best/:width/:height", async (req, res) => {
  const width = Number(req.params.width);
  const height = Number(req.params.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return res.status(400).json({ ok: false, error: "Invalid size" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT r.width, r.height, r.user_id, r.nickname, r.elapsed_sec, r.puzzle_id, r.game_start_at_ms,
              r.frames_json, EXTRACT(EPOCH FROM r.updated_at) * 1000 AS updated_at_ms,
              p.id AS puzzle_id2, p.row_hints, p.col_hints, p.is_unique
       FROM best_replay_records r
       JOIN users u ON u.id = r.user_id
       JOIN puzzles p ON p.id = r.puzzle_id
       WHERE r.width = $1 AND r.height = $2
         AND u.is_bot = false
         AND r.elapsed_sec > 0
       LIMIT 1`,
      [width, height]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Replay not found for this size" });
    }
    const row = rows[0];
    const frames = downsampleReplayFrames(row.frames_json, REPLAY_MAX_FRAMES);
    return res.json({
      ok: true,
      replay: {
        width: Number(row.width),
        height: Number(row.height),
        sizeKey: `${Number(row.width)}x${Number(row.height)}`,
        userId: Number(row.user_id),
        nickname: String(row.nickname || ""),
        elapsedSec: Number(row.elapsed_sec),
        puzzleId: Number(row.puzzle_id),
        gameStartAtMs: Number(row.game_start_at_ms),
        updatedAtMs: Number(row.updated_at_ms || 0),
        frames,
      },
      puzzle: {
        id: Number(row.puzzle_id2),
        width: Number(row.width),
        height: Number(row.height),
        row_hints: row.row_hints,
        col_hints: row.col_hints,
        is_unique: row.is_unique,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/replays/hall", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ranked.id, ranked.width, ranked.height, ranked.user_id, ranked.nickname,
              ranked.elapsed_sec, ranked.elapsed_ms, ranked.puzzle_id, ranked.finished_at_ms, ranked.rank
       FROM (
         SELECT
           h.id,
           h.width,
           h.height,
           h.user_id,
           h.nickname,
           h.elapsed_sec,
           GREATEST(
             1,
             CASE
               WHEN h.finished_at_ms > h.game_start_at_ms THEN (h.finished_at_ms - h.game_start_at_ms)
               ELSE (h.elapsed_sec * 1000)
             END
           ) AS elapsed_ms,
           h.puzzle_id,
           h.finished_at_ms,
           ROW_NUMBER() OVER (
             PARTITION BY h.width, h.height
             ORDER BY
               GREATEST(
                 1,
                 CASE
                   WHEN h.finished_at_ms > h.game_start_at_ms THEN (h.finished_at_ms - h.game_start_at_ms)
                   ELSE (h.elapsed_sec * 1000)
                 END
               ) ASC,
               h.game_start_at_ms ASC,
               h.id ASC
           ) AS rank
         FROM hall_replay_records h
         JOIN users u ON u.id = h.user_id
         WHERE u.is_bot = false
           AND h.elapsed_sec > 0
       ) ranked
       WHERE ranked.rank <= $1
       ORDER BY ranked.width ASC, ranked.height ASC, ranked.rank ASC`,
      [HALL_TOP_LIMIT]
    );
    const { rows: streakRows } = await pool.query(
      `SELECT ranked.user_id, ranked.nickname, ranked.win_streak_best, ranked.rank
       FROM (
         SELECT
           u.id AS user_id,
           u.nickname,
           u.win_streak_best,
           ROW_NUMBER() OVER (
             ORDER BY u.win_streak_best DESC, u.rating DESC, u.id ASC
           ) AS rank
         FROM users u
         WHERE u.is_bot = false
           AND u.win_streak_best > 0
       ) ranked
       WHERE ranked.rank <= $1
       ORDER BY ranked.rank ASC`,
      [HALL_TOP_LIMIT]
    );

    const bySize = new Map();
    for (const [w, h] of PVP_SIZE_OPTIONS) {
      const key = `${w}x${h}`;
      bySize.set(key, { sizeKey: key, width: w, height: h, top: [] });
    }

    for (const r of rows) {
      const width = Number(r.width);
      const height = Number(r.height);
      const key = `${width}x${height}`;
      if (!bySize.has(key)) {
        bySize.set(key, { sizeKey: key, width, height, top: [] });
      }
      bySize.get(key).top.push({
        recordId: Number(r.id),
        rank: Number(r.rank),
        userId: Number(r.user_id),
        nickname: String(r.nickname || ""),
        elapsedSec: Number(r.elapsed_sec),
        elapsedMs: Number(r.elapsed_ms || Number(r.elapsed_sec || 0) * 1000),
        puzzleId: Number(r.puzzle_id),
        finishedAtMs: Number(r.finished_at_ms),
      });
    }

    const sizes = [];
    for (const [w, h] of PVP_SIZE_OPTIONS) {
      const key = `${w}x${h}`;
      sizes.push(bySize.get(key) || { sizeKey: key, width: w, height: h, top: [] });
    }

    const streakTop = streakRows.map((r) => ({
      rank: Number(r.rank),
      userId: Number(r.user_id),
      nickname: String(r.nickname || ""),
      winStreakBest: Number(r.win_streak_best || 0),
    }));

    return res.json({ ok: true, sizes, streakTop });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/replays/hall/record/:recordId", async (req, res) => {
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid record id" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT
         h.id,
         h.width,
         h.height,
         h.user_id,
         h.nickname,
         h.elapsed_sec,
         GREATEST(
           1,
           CASE
             WHEN h.finished_at_ms > h.game_start_at_ms THEN (h.finished_at_ms - h.game_start_at_ms)
             ELSE (h.elapsed_sec * 1000)
           END
         ) AS elapsed_ms,
         h.puzzle_id,
         h.game_start_at_ms,
         h.finished_at_ms,
         h.frames_json,
         p.id AS puzzle_id2,
         p.row_hints,
         p.col_hints,
         p.is_unique
       FROM hall_replay_records h
       JOIN users u ON u.id = h.user_id
       JOIN puzzles p ON p.id = h.puzzle_id
       WHERE h.id = $1
         AND u.is_bot = false
         AND h.elapsed_sec > 0
       LIMIT 1`,
      [recordId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Replay record not found" });
    }
    const row = rows[0];
    const frames = downsampleReplayFrames(row.frames_json, REPLAY_MAX_FRAMES);
    return res.json({
      ok: true,
      record: {
        recordId: Number(row.id),
        width: Number(row.width),
        height: Number(row.height),
        sizeKey: `${Number(row.width)}x${Number(row.height)}`,
        userId: Number(row.user_id),
        nickname: String(row.nickname || ""),
        elapsedSec: Number(row.elapsed_sec),
        elapsedMs: Number(row.elapsed_ms || Number(row.elapsed_sec || 0) * 1000),
        puzzleId: Number(row.puzzle_id),
        gameStartAtMs: Number(row.game_start_at_ms),
        finishedAtMs: Number(row.finished_at_ms),
        frames,
      },
      puzzle: {
        id: Number(row.puzzle_id2),
        width: Number(row.width),
        height: Number(row.height),
        row_hints: row.row_hints,
        col_hints: row.col_hints,
        is_unique: row.is_unique,
      },
    });
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

function isPvpTicketMatchEligible(ticket, now = Date.now()) {
  if (!ticket || ticket.state !== "waiting") return false;
  const eligibleAt = Number(ticket.matchEligibleAt || ticket.createdAt || 0);
  return Number.isFinite(eligibleAt) ? now >= eligibleAt : true;
}

function createPvpMatch(ticketA, ticketB) {
  const now = Date.now();
  const matchId = randomPlayerId();
  const sizeOptions = getPvpSizeOptionsForTickets(ticketA, ticketB);
  const players = [ticketA, ticketB].map((ticket) => {
    const isBot = ticket?.isBot === true;
    const botDifficulty = isBot ? normalizeBotDifficulty(ticket?.botSkill) : null;
    const botConf = isBot
      ? BOT_DIFFICULTY_CONFIG[normalizeBotDifficulty(botDifficulty)] || BOT_DIFFICULTY_CONFIG.normal
      : null;
    const ticketRating = normalizeRatingValue(ticket?.rating);
    const ticketRank = normalizeRatingRank(ticket?.ratingRank);
    return {
      userId: ticket.userId,
      nickname: ticket.nickname,
      rating: ticketRating,
      ratingRank: ticketRank,
      profileAvatarKey: normalizeProfileAvatarKey(ticket?.profileAvatarKey),
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
    banStartAt: null,
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
    options: sizeOptions.map(([width, height]) => ({
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

function maybeMatchWaitingTicketsWithHuman(now = Date.now()) {
  const eligible = [];
  for (const ticketId of pvpWaitingOrder) {
    const ticket = pvpQueueTickets.get(ticketId);
    if (!ticket) continue;
    if (ticket.state !== "waiting") continue;
    if (now - Number(ticket.updatedAt || ticket.createdAt || now) > PVP_QUEUE_STALE_MS) {
      removePvpTicket(ticketId);
      continue;
    }
    if (isUserInAnyRoom(ticket.userId)) {
      removePvpTicket(ticketId);
      continue;
    }
    if (!isPvpTicketMatchEligible(ticket, now)) continue;
    eligible.push({ ticketId, ticket });
  }

  if (eligible.length < 2) return;

  // Older waiting tickets get matched first.
  eligible.sort((a, b) => Number(a.ticket.createdAt || 0) - Number(b.ticket.createdAt || 0));

  const used = new Set();
  for (let i = 0; i < eligible.length; i += 1) {
    const aEntry = eligible[i];
    if (!aEntry) continue;
    const aId = aEntry.ticketId;
    const a = pvpQueueTickets.get(aId);
    if (!a || a.state !== "waiting" || used.has(aId)) continue;

    let best = null;
    for (let j = i + 1; j < eligible.length; j += 1) {
      const bEntry = eligible[j];
      if (!bEntry) continue;
      const bId = bEntry.ticketId;
      if (used.has(bId) || bId === aId) continue;
      const b = pvpQueueTickets.get(bId);
      if (!b || b.state !== "waiting") continue;
      if (a.userId === b.userId) continue;
      if (!canTierMatch(a, b, now)) continue;
      const score = tierMatchScore(a, b);
      if (!best || score < best.score) {
        best = { bId, score };
      }
    }
    if (!best) continue;

    const b = pvpQueueTickets.get(best.bId);
    if (!b || b.state !== "waiting") continue;
    const idxA = pvpWaitingOrder.indexOf(aId);
    if (idxA >= 0) pvpWaitingOrder.splice(idxA, 1);
    const idxB = pvpWaitingOrder.indexOf(best.bId);
    if (idxB >= 0) pvpWaitingOrder.splice(idxB, 1);
    used.add(aId);
    used.add(best.bId);
    createPvpMatch(a, b);
  }
}

async function maybeMatchWaitingTicketsWithBot(now = Date.now()) {
  if (!pvpBotEnabledRuntime) return;
  const candidates = [...pvpWaitingOrder];
  for (const ticketId of candidates) {
    const ticket = pvpQueueTickets.get(ticketId);
    if (!ticket) continue;
    if (ticket.state !== "waiting") continue;
    if (isUserInAnyRoom(ticket.userId)) {
      removePvpTicket(ticketId);
      continue;
    }
    if (!isPvpTicketMatchEligible(ticket, now)) continue;
    if (!Number.isFinite(Number(ticket.botEligibleAt))) {
      ticket.botEligibleAt = Number(ticket.createdAt || now) + randomInt(PVP_BOT_WAIT_MIN_MS, PVP_BOT_WAIT_MAX_MS);
    }
    if (!Number.isFinite(Number(ticket.botNextAttemptAt))) {
      ticket.botNextAttemptAt = ticket.botEligibleAt;
    }
    if (now < Number(ticket.botNextAttemptAt)) continue;
    if (now < Number(ticket.botEligibleAt)) continue;

    const waitedMs = Math.max(0, now - Number(ticket.botEligibleAt));
    const chanceBoost = Math.min(0.45, waitedMs / 60000);
    const spawnChance = Math.min(PVP_BOT_MATCH_MAX_CHANCE, PVP_BOT_MATCH_BASE_CHANCE + chanceBoost);
    if (Math.random() > spawnChance) {
      ticket.botNextAttemptAt = now + randomInt(PVP_BOT_RETRY_MIN_MS, PVP_BOT_RETRY_MAX_MS);
      continue;
    }
    const idx = pvpWaitingOrder.indexOf(ticketId);
    if (idx >= 0) pvpWaitingOrder.splice(idx, 1);
    const botTicket = await fetchAvailablePvpBotTicket(now, ticket);
    if (!botTicket) {
      pvpWaitingOrder.push(ticketId);
      ticket.botNextAttemptAt = now + randomInt(PVP_BOT_RETRY_MIN_MS, PVP_BOT_RETRY_MAX_MS);
      continue;
    }
    createPvpMatch(ticket, botTicket);
  }
}

app.post("/pvp/queue/join", requireAuth, async (req, res) => {
  cleanupPvpQueue(Date.now());

  const placementDone = hasActivePlacement(req.authUser);
  const placementRating = Number(req.authUser.placement_rating);
  if (!placementDone || !Number.isFinite(placementRating) || placementRating < 0) {
    return res.status(403).json({ ok: false, error: "Placement required" });
  }

  if (isUserInAnyRoom(req.authUser.id)) {
    return res.status(400).json({ ok: false, error: "You are already in a room" });
  }

  const now = Date.now();
  const existingTicketId = pvpUserTicket.get(req.authUser.id);
  if (existingTicketId) {
    const existing = pvpQueueTickets.get(existingTicketId);
    if (existing) {
      existing.updatedAt = now;
      existing.profileAvatarKey = normalizeProfileAvatarKey(req.authUser.profile_avatar_key);
      const hasRating = Number.isFinite(Number(existing.rating));
      const hasRank = Number.isInteger(Number(existing.ratingRank)) && Number(existing.ratingRank) > 0;
      if (!hasRating || !hasRank) {
        const existingSnapshot = await fetchUserRatingSnapshot(existing.userId);
        existing.rating = normalizeRatingValue(existingSnapshot?.rating ?? getDisplayRating(req.authUser));
        existing.ratingRank = normalizeRatingRank(existingSnapshot?.rank);
      }
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
  const matchEligibleAt = now + randomInt(PVP_MATCH_DELAY_MIN_MS, PVP_MATCH_DELAY_MAX_MS);
  const ratingSnapshot = await fetchUserRatingSnapshot(req.authUser.id);
  const myRating = normalizeRatingValue(ratingSnapshot?.rating ?? getDisplayRating(req.authUser));
  const myRatingRank = normalizeRatingRank(ratingSnapshot?.rank);
    const myTicket = {
      ticketId: myTicketId,
      userId: req.authUser.id,
      nickname: req.authUser.nickname,
      rating: myRating,
      ratingRank: myRatingRank,
      profileAvatarKey: normalizeProfileAvatarKey(req.authUser.profile_avatar_key),
      state: "waiting",
    createdAt: now,
    updatedAt: now,
    matchId: null,
    roomCode: null,
    playerId: null,
    cancelReason: null,
    matchEligibleAt,
    botEligibleAt: matchEligibleAt,
    botNextAttemptAt: null,
  };
  pvpQueueTickets.set(myTicketId, myTicket);
  pvpUserTicket.set(req.authUser.id, myTicketId);
  pvpWaitingOrder.push(myTicketId);

  return res.json({
    ok: true,
    ticketId: myTicketId,
    state: "waiting",
    matched: false,
    queueSize: getVisiblePvpQueueSize(),
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
      mode: "race_room",
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
      matchLogSaved: false,
      matchLogSaving: false,
      bestReplaySaved: false,
      bestReplaySaving: false,
      chatMessages: [],
      reactionEvents: [],
      players: new Map(),
    };
    room.players.set(playerId, {
      playerId,
      userId: req.authUser.id,
      nickname,
      profileAvatarKey: normalizeProfileAvatarKey(req.authUser.profile_avatar_key),
      joinedAt: nowIso,
      finishedAt: null,
      elapsedSec: null,
      isReady: false,
      disconnectedAt: null,
      correctAnswerCells: 0,
      lastSeenAt: Date.now(),
      lastMoveAt: null,
      loseReason: null,
      progressFrames: [],
      lastReplayBits: "",
      lastReplayFrameAt: 0,
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
      profileAvatarKey: normalizeProfileAvatarKey(req.authUser.profile_avatar_key),
      joinedAt: new Date().toISOString(),
      finishedAt: null,
      elapsedSec: null,
      isReady: false,
      disconnectedAt: null,
      correctAnswerCells: 0,
      lastSeenAt: Date.now(),
      lastMoveAt: null,
      loseReason: null,
      progressFrames: [],
      lastReplayBits: "",
      lastReplayFrameAt: 0,
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
  room.matchLogSaved = false;
  room.matchLogSaving = false;
  room.bestReplaySaved = false;
  room.bestReplaySaving = false;
  room.finishTarget = Math.max(1, room.players.size - 1);
  const initialBits = emptyBitsBase64(room.width, room.height);
  for (const p of room.players.values()) {
    p.finishedAt = null;
    p.elapsedSec = null;
    p.disconnectedAt = null;
    p.correctAnswerCells = 0;
    p.lastSeenAt = now;
    p.lastMoveAt = room.gameStartAt;
    p.loseReason = null;
    p.progressFrames = [{ atMs: 0, bits: initialBits }];
    p.lastReplayBits = initialBits;
    p.lastReplayFrameAt = 0;
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
  const actionAt = Date.now();
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
    player.lastMoveAt = actionAt;
    if (player.loseReason === "inactive_timeout") {
      player.loseReason = null;
    }
    captureReplayFrame(room, player, userBits, actionAt);
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
  await persistMatchLogIfNeeded(room);
  await persistBestReplayRecordIfNeeded(room);

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
    room.matchLogSaved = false;
    room.matchLogSaving = false;
    room.bestReplaySaved = false;
    room.bestReplaySaving = false;
    room.reactionEvents = [];
    room.finishTarget = Math.max(1, room.players.size - 1);
    for (const p of room.players.values()) {
      p.isReady = false;
      p.finishedAt = null;
      p.elapsedSec = null;
      p.disconnectedAt = null;
      p.correctAnswerCells = 0;
      p.lastSeenAt = Date.now();
      p.lastMoveAt = null;
      p.loseReason = null;
      p.progressFrames = [];
      p.lastReplayBits = "";
      p.lastReplayFrameAt = 0;
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
    userId: Number(player.userId),
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
    player.elapsedSec = Math.max(1, Math.floor(elapsedSec));
    player.finishedAt = new Date().toISOString();
    player.correctAnswerCells = room.totalAnswerCells || player.correctAnswerCells || 0;
    player.lastMoveAt = Date.now();
    player.loseReason = null;
  }
  maybeFinalizeRoom(room);
  await applyRatedResultIfNeeded(room);
  await persistMatchLogIfNeeded(room);
  await persistBestReplayRecordIfNeeded(room);

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

  // Finalize first if finish conditions are already satisfied.
  maybeFinalizeRoom(room);

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
    return res.json({ ok: true, leavePenalty: { applied: false, points: 0 }, room: roomPublicState(room) });
  }

  const leavePenalty = await applyLeaveRoomPenaltyIfNeeded(room, player);

  if (!player.disconnectedAt) {
    player.disconnectedAt = new Date().toISOString();
  }
  player.loseReason = player.loseReason || "left";
  player.isReady = false;

  if (!room.winnerPlayerId) {
    const alive = Array.from(room.players.values()).filter(
      (p) => !p.disconnectedAt && !Number.isInteger(p.elapsedSec) && !p.loseReason
    );
    if (alive.length === 1) {
      room.winnerPlayerId = alive[0].playerId;
    }
  }
  maybeFinalizeRoom(room);
  await applyRatedResultIfNeeded(room);
  await persistMatchLogIfNeeded(room);
  await persistBestReplayRecordIfNeeded(room);

  return res.json({ ok: true, leavePenalty, room: roomPublicState(room) });
});

app.post("/single/finish", async (req, res) => {
  const elapsedRaw = Number(req.body?.elapsedSec);
  const puzzleIdRaw = Number(req.body?.puzzleId);
  const widthRaw = Number(req.body?.width);
  const heightRaw = Number(req.body?.height);

  if (!Number.isFinite(elapsedRaw) || elapsedRaw <= 0) {
    return res.status(400).json({ ok: false, error: "elapsedSec is required" });
  }

  const elapsedSec = Math.max(1, Math.floor(elapsedRaw));
  let puzzleId = Number.isInteger(puzzleIdRaw) && puzzleIdRaw > 0 ? puzzleIdRaw : null;
  let width = Number.isInteger(widthRaw) && widthRaw > 0 ? widthRaw : null;
  let height = Number.isInteger(heightRaw) && heightRaw > 0 ? heightRaw : null;

  try {
    if (puzzleId) {
      const { rows } = await pool.query(
        `SELECT id, width, height
         FROM puzzles
         WHERE id = $1
         LIMIT 1`,
        [puzzleId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, error: "Puzzle not found" });
      }
      width = Number(rows[0].width);
      height = Number(rows[0].height);
    }

    let authUser = null;
    try {
      authUser = await getAuthUserFromReq(req);
    } catch {
      authUser = null;
    }

    const winnerUserId =
      authUser && Number.isInteger(Number(authUser.id)) ? Number(authUser.id) : null;
    const winnerNickname = String(authUser?.nickname || req.body?.nickname || "Guest").slice(0, 64);
    const finishedAtMs = Date.now();
    const gameStartAtMs = finishedAtMs - elapsedSec * 1000;
    const roomCode = `S${finishedAtMs.toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const playerId = winnerUserId ? `u${winnerUserId}` : "guest";
    const rankings = [
      {
        rank: 1,
        playerId,
        nickname: winnerNickname,
        elapsedSec,
        status: "finished",
      },
    ];
    const playersPayload = [
      {
        userId: winnerUserId,
        playerId,
        nickname: winnerNickname,
        isBot: false,
        elapsedSec,
        rank: 1,
        status: "finished",
        outcome: "win",
        disconnectedAt: null,
      },
    ];

    await pool.query(
      `INSERT INTO race_match_logs (
        room_code, game_start_at_ms, room_created_at_ms, mode, puzzle_id, width, height,
        winner_user_id, winner_nickname, player_count, participants, rankings_json, players_json, finished_at_ms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14
      )
      ON CONFLICT (room_code, game_start_at_ms) DO NOTHING`,
      [
        roomCode,
        gameStartAtMs,
        gameStartAtMs,
        "single",
        puzzleId,
        width,
        height,
        winnerUserId,
        winnerNickname,
        1,
        winnerNickname,
        JSON.stringify(rankings),
        JSON.stringify(playersPayload),
        finishedAtMs,
      ]
    );

    return res.json({
      ok: true,
      mode: "single",
      elapsedSec,
      finishedAtMs,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
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
  startPvpBotLadderLoop();
  app.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
