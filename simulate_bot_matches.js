const crypto = require("crypto");
const { Pool } = require("pg");

const ELO_DEFAULT_RATING = 1500;
const ELO_PLACEMENT_GAMES = 20;
const ELO_K_PLACEMENT = 40;
const ELO_K_NORMAL = 24;
const ELO_MIN_WIN_DELTA = Math.max(1, Number(process.env.ELO_MIN_WIN_DELTA || 5));
const ELO_MIN_LOSS_DELTA = Math.max(1, Number(process.env.ELO_MIN_LOSS_DELTA || 5));
const WIN_STREAK_BONUS_TABLE = [
  [5, 10],
  [4, 7],
  [3, 5],
  [2, 3],
];

const BOT_SOLVE_TIME_RANGE_SEC = {
  "5x5": { easy: [120, 180], normal: [45, 108], hard: [14, 28] },
  "10x10": { easy: [300, 360], normal: [108, 216], hard: [57, 85] },
  "15x15": { easy: [960, 1500], normal: [540, 810], hard: [285, 399] },
  "20x20": { easy: [1500, 1800], normal: [810, 1080], hard: [399, 570] },
  "25x25": { easy: [2700, 3000], normal: [1134, 1890], hard: [855, 1140] },
};
const SIZES = ["5x5", "10x10", "15x15", "20x20", "25x25"];

function randomInt(min, max) {
  const lo = Math.floor(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeBotDifficulty(rawDifficulty = "normal") {
  const v = String(rawDifficulty || "").trim().toLowerCase();
  if (v === "easy" || v === "hard") return v;
  return "normal";
}

function pickBotTargetSec(sizeKey, rawDifficulty = "normal") {
  const difficulty = normalizeBotDifficulty(rawDifficulty);
  const bySize = BOT_SOLVE_TIME_RANGE_SEC[sizeKey];
  if (bySize && Array.isArray(bySize[difficulty])) {
    const [minSec, maxSec] = bySize[difficulty];
    return randomInt(minSec, maxSec);
  }
  if (bySize && Array.isArray(bySize.normal)) {
    const [minSec, maxSec] = bySize.normal;
    return randomInt(minSec, maxSec);
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

function eloSignedDelta(expected, score, k) {
  const raw = Math.round(Number(k) * (Number(score) - Number(expected)));
  if (score >= 1) return Math.max(ELO_MIN_WIN_DELTA, raw);
  if (score <= 0) return Math.min(-ELO_MIN_LOSS_DELTA, raw);
  return raw;
}

function eloNextRating(currentRating, expected, score, k) {
  const base = Number.isFinite(Number(currentRating)) ? Number(currentRating) : ELO_DEFAULT_RATING;
  const delta = eloSignedDelta(expected, score, k);
  return clamp(Math.round(base + delta), 100, 4000);
}

function getWinStreakBonus(nextStreak) {
  const streak = Number(nextStreak || 0);
  if (!Number.isInteger(streak) || streak < 2) return 0;
  for (const [minStreak, bonus] of WIN_STREAK_BONUS_TABLE) {
    if (streak >= minStreak) return Number(bonus || 0);
  }
  return 0;
}

function pickWeightedBot(bots, excludeId = null) {
  const pool = bots.filter((b) => Number(b.id) !== Number(excludeId));
  const total = pool.reduce((acc, b) => acc + Math.max(1, Number(b.bot_spawn_weight || 1)), 0);
  let r = Math.random() * total;
  for (const b of pool) {
    r -= Math.max(1, Number(b.bot_spawn_weight || 1));
    if (r <= 0) return b;
  }
  return pool[pool.length - 1];
}

function buildRoomCode() {
  return `B${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`.slice(0, 16);
}

function dbConfigFromEnv() {
  const useSSL = String(process.env.PGSSLMODE || "").toLowerCase() === "require";
  return {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "1234",
    database: process.env.PGDATABASE || "nonogram_prod",
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  };
}

async function main() {
  const matchCount = Math.max(1, Number(process.argv[2] || 30));
  const pool = new Pool(dbConfigFromEnv());

  try {
    const { rows: botRows } = await pool.query(
      `SELECT id, nickname, rating, rating_games, rating_wins, rating_losses,
              win_streak_current, win_streak_best,
              COALESCE(bot_skill, 'normal') AS bot_skill,
              COALESCE(bot_spawn_weight, 1) AS bot_spawn_weight
       FROM users
       WHERE is_bot = true
       ORDER BY id ASC`
    );

    if (botRows.length < 2) {
      throw new Error("Need at least 2 bots in users table.");
    }

    const bots = botRows.map((b) => ({
      id: Number(b.id),
      nickname: String(b.nickname || `bot-${b.id}`),
      rating: Number(b.rating || ELO_DEFAULT_RATING),
      rating_games: Number(b.rating_games || 0),
      rating_wins: Number(b.rating_wins || 0),
      rating_losses: Number(b.rating_losses || 0),
      win_streak_current: Number(b.win_streak_current || 0),
      win_streak_best: Number(b.win_streak_best || 0),
      bot_skill: normalizeBotDifficulty(b.bot_skill),
      bot_spawn_weight: Math.max(1, Number(b.bot_spawn_weight || 1)),
    }));
    const botById = new Map(bots.map((b) => [b.id, b]));

    let done = 0;
    for (let i = 0; i < matchCount; i += 1) {
      const a = pickWeightedBot(bots);
      const b = pickWeightedBot(bots, a.id);
      const sizeKey = SIZES[randomInt(0, SIZES.length - 1)];
      const [w, h] = sizeKey.split("x").map(Number);

      const { rows: puzzleRows } = await pool.query(
        `SELECT id
         FROM puzzles
         WHERE width = $1 AND height = $2 AND solution_bits IS NOT NULL
         ORDER BY random()
         LIMIT 1`,
        [w, h]
      );
      if (!puzzleRows.length) continue;
      const puzzleId = Number(puzzleRows[0].id);

      const aSec = pickBotTargetSec(sizeKey, a.bot_skill);
      const bSec = pickBotTargetSec(sizeKey, b.bot_skill);

      let winner = a;
      let loser = b;
      let winnerSec = aSec;
      let loserSec = bSec;
      if (bSec < aSec || (bSec === aSec && Math.random() < 0.5)) {
        winner = b;
        loser = a;
        winnerSec = bSec;
        loserSec = aSec;
      }

      const expectedWinner = eloExpected(winner.rating, loser.rating);
      const expectedLoser = eloExpected(loser.rating, winner.rating);
      const winnerK = eloKFactor(winner.rating_games);
      const loserK = eloKFactor(loser.rating_games);
      const winnerBaseNext = eloNextRating(winner.rating, expectedWinner, 1, winnerK);
      const loserNext = eloNextRating(loser.rating, expectedLoser, 0, loserK);
      const winnerNextStreak = Math.max(0, winner.win_streak_current) + 1;
      const winnerStreakBonus = getWinStreakBonus(winnerNextStreak);
      const winnerNext = clamp(winnerBaseNext + winnerStreakBonus, 100, 4000);

      const roomCode = buildRoomCode();
      const gameStartAtMs = Date.now() - (loserSec * 1000 + randomInt(4000, 20000));
      const roomCreatedAtMs = gameStartAtMs - randomInt(2000, 7000);
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
            "pvp_bot",
            puzzleId,
            w,
            h,
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
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }

      winner.rating = winnerNext;
      winner.rating_games += 1;
      winner.rating_wins += 1;
      winner.win_streak_current = winnerNextStreak;
      winner.win_streak_best = Math.max(winner.win_streak_best, winnerNextStreak);
      loser.rating = loserNext;
      loser.rating_games += 1;
      loser.rating_losses += 1;
      loser.win_streak_current = 0;

      botById.set(winner.id, winner);
      botById.set(loser.id, loser);
      done += 1;
      console.log(
        `[${done}/${matchCount}] ${winner.nickname} beat ${loser.nickname} (${sizeKey}, ${winnerSec}s vs ${loserSec}s)`
      );
    }

    const { rows: topRows } = await pool.query(
      `SELECT nickname, rating, rating_games, rating_wins, rating_losses
       FROM users
       WHERE is_bot = true
       ORDER BY rating DESC, id ASC
       LIMIT 10`
    );
    console.log(`done_matches=${done}`);
    console.table(topRows);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("simulate_bot_matches failed:", err.message || err);
  process.exit(1);
});
