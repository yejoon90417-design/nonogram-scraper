import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { motion } from "framer-motion";
import { ChevronDown, Eraser, Home, Lock, LogIn, Maximize2, Minimize2, Minus, Moon, Plus, Redo2, Settings, Sun, Trophy, Undo2, User, UserPlus, Volume2, VolumeX } from "lucide-react";
import "./App.css";

const DEFAULT_API_BASE = "https://nonogram-api.onrender.com";

function normalizeApiBase(raw) {
  const value = String(raw || "").trim();
  if (!value) return DEFAULT_API_BASE;
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  if (value.startsWith("//")) return `https:${value}`.replace(/\/+$/, "");
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(value)) return `https://${value}`.replace(/\/+$/, "");
  return DEFAULT_API_BASE;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
const MAX_HISTORY = 200;
const AUTH_TOKEN_KEY = "nonogram-auth-token";
const AUTH_USER_KEY = "nonogram-auth-user";
const PROFILE_AVATAR_LOCAL_OVERRIDES_KEY = "nonogram-local-profile-avatar-overrides";
const LANG_KEY = "nonogram-ui-lang";
const THEME_KEY = "nonogram-ui-theme";
const STYLE_VARIANT_KEY = "nonogram-ui-style-variant";
const SOUND_KEY = "nonogram-ui-sound";
const TUTORIAL_SEEN_KEY = "nonogram-tutorial-seen-v1";
const PVP_SIZE_KEYS = ["5x5", "10x10", "15x15", "20x20", "25x25"];
const PVP_SIZE_KEYS_LOW_TIER = ["5x5", "10x10", "15x15"];
const PVP_SIZE_KEYS_GOLD_PLUS = ["10x10", "15x15", "20x20", "25x25"];
const PVP_REVEAL_RESULT_HOLD_MS = 1600;
const SOUND_MASTER_GAIN_MAX = 0.34;
const ADSENSE_SCRIPT_ID = "adsense-auto-script";
const ADSENSE_SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1492932683312516";
const MODE_TO_PATH = {
  menu: "/",
  single: "/single",
  multi: "/multi",
  pvp: "/pvp",
  placement_test: "/placement",
  auth: "/auth",
  tutorial: "/tutorial",
  ranking: "/ranking",
  legacy_ranking: "/ranking-legacy",
  replay_hall: "/hall",
};
const PLACEMENT_TIME_LIMIT_SEC = 300;
const PLACEMENT_STAGES = [
  { key: "s1", sizeKey: "5x5", labelKo: "1번 퍼즐", labelEn: "Puzzle 1" },
  { key: "s2", sizeKey: "10x10", labelKo: "2번 퍼즐", labelEn: "Puzzle 2" },
  { key: "s3", sizeKey: "10x10", labelKo: "3번 퍼즐", labelEn: "Puzzle 3" },
  { key: "s4", sizeKey: "15x15", labelKo: "4번 퍼즐", labelEn: "Puzzle 4" },
  { key: "s5", sizeKey: "15x15", labelKo: "5번 퍼즐", labelEn: "Puzzle 5" },
];
const TIER_IMAGE_MAP = {
  bronze: "/tiers/bronze.png",
  silver: "/tiers/silver.png",
  gold: "/tiers/gold.png",
  diamond: "/tiers/diamond.png",
  master: "/tiers/master.png",
};
const TIER_GUIDE_IMAGE_MAP = {
  ko: "/tier-guide/ko.png",
  en: "/tier-guide/en.png",
};
const DEFAULT_PROFILE_AVATAR_KEY = "default-user";
const DEFAULT_PROFILE_AVATAR_OPTIONS = [
  { key: "default-user", labelKo: "스마일", labelEn: "Smile", emoji: "😎", colorA: "#8dc8ff", colorB: "#31568e" },
  { key: "default-ember", labelKo: "불꽃", labelEn: "Fire", emoji: "🔥", colorA: "#ffb26b", colorB: "#b24a1f" },
  { key: "default-rose", labelKo: "장미", labelEn: "Rose", emoji: "🌹", colorA: "#ff9cc4", colorB: "#a33d67" },
  { key: "default-mint", labelKo: "클로버", labelEn: "Clover", emoji: "🍀", colorA: "#91efc3", colorB: "#2d7c59" },
  { key: "default-violet", labelKo: "유니콘", labelEn: "Unicorn", emoji: "🦄", colorA: "#c4a7ff", colorB: "#6540ab" },
  { key: "default-cobalt", labelKo: "보석", labelEn: "Gem", emoji: "💎", colorA: "#8cb3ff", colorB: "#29478f" },
  { key: "default-sky", labelKo: "구름", labelEn: "Cloud", emoji: "☁️", colorA: "#9fe6ff", colorB: "#347aa0" },
  { key: "default-ocean", labelKo: "파도", labelEn: "Wave", emoji: "🌊", colorA: "#79d4ff", colorB: "#1e4f8a" },
  { key: "default-forest", labelKo: "숲", labelEn: "Forest", emoji: "🌲", colorA: "#7fd48c", colorB: "#275c39" },
  { key: "default-sage", labelKo: "잎", labelEn: "Leaf", emoji: "🌿", colorA: "#b9ddc3", colorB: "#4b6d55" },
  { key: "default-lavender", labelKo: "나비", labelEn: "Butterfly", emoji: "🦋", colorA: "#d4c2ff", colorB: "#7053b0" },
  { key: "default-orchid", labelKo: "벚꽃", labelEn: "Blossom", emoji: "🌸", colorA: "#f4b8ff", colorB: "#9545a3" },
  { key: "default-plum", labelKo: "포도", labelEn: "Grape", emoji: "🍇", colorA: "#c999d8", colorB: "#63356f" },
  { key: "default-crimson", labelKo: "하트", labelEn: "Heart", emoji: "❤️", colorA: "#ff8da1", colorB: "#8b2239" },
  { key: "default-coral", labelKo: "물고기", labelEn: "Fish", emoji: "🐠", colorA: "#ffaf93", colorB: "#a34934" },
  { key: "default-peach", labelKo: "복숭아", labelEn: "Peach", emoji: "🍑", colorA: "#ffd2a8", colorB: "#ad6a3f" },
  { key: "default-sand", labelKo: "별", labelEn: "Star", emoji: "⭐", colorA: "#ead4aa", colorB: "#907247" },
  { key: "default-lemon", labelKo: "레몬", labelEn: "Lemon", emoji: "🍋", colorA: "#fff08a", colorB: "#9a7e23" },
  { key: "default-lime", labelKo: "개구리", labelEn: "Frog", emoji: "🐸", colorA: "#d5ff7e", colorB: "#6c8e18" },
  { key: "default-teal", labelKo: "문어", labelEn: "Octopus", emoji: "🐙", colorA: "#84f0dc", colorB: "#1e7d72" },
  { key: "default-aqua", labelKo: "돌고래", labelEn: "Dolphin", emoji: "🐬", colorA: "#8cf6ff", colorB: "#1c7c88" },
  { key: "default-azure", labelKo: "고양이", labelEn: "Cat", emoji: "🐱", colorA: "#9ec8ff", colorB: "#2859a2" },
  { key: "default-navy", labelKo: "펭귄", labelEn: "Penguin", emoji: "🐧", colorA: "#7c98cb", colorB: "#22385e" },
  { key: "default-slate", labelKo: "곰", labelEn: "Bear", emoji: "🐻", colorA: "#c1ccda", colorB: "#516074" },
  { key: "default-silverline", labelKo: "로봇", labelEn: "Robot", emoji: "🤖", colorA: "#dfe5ef", colorB: "#6a7788" },
  { key: "default-goldline", labelKo: "왕관", labelEn: "Crown", emoji: "👑", colorA: "#ffe18d", colorB: "#a57217" },
  { key: "default-bronzeline", labelKo: "방패", labelEn: "Shield", emoji: "🛡️", colorA: "#e5b28a", colorB: "#8b512f" },
  { key: "default-berry", labelKo: "딸기", labelEn: "Strawberry", emoji: "🍓", colorA: "#f2a4d6", colorB: "#8e3f71" },
  { key: "default-fuchsia", labelKo: "무지개", labelEn: "Rainbow", emoji: "🌈", colorA: "#ff9cf8", colorB: "#9a2da1" },
  { key: "default-ruby", labelKo: "체리", labelEn: "Cherry", emoji: "🍒", colorA: "#ff9e9e", colorB: "#932d44" },
  { key: "default-ice", labelKo: "눈꽃", labelEn: "Snow", emoji: "❄️", colorA: "#d8fbff", colorB: "#4e87a6" },
  { key: "default-cloud", labelKo: "퍼즐", labelEn: "Puzzle", emoji: "🧩", colorA: "#edf2f7", colorB: "#778396" },
  { key: "default-night", labelKo: "달", labelEn: "Moon", emoji: "🌙", colorA: "#8da0c8", colorB: "#2c3553" },
  { key: "default-spring", labelKo: "꽃", labelEn: "Flower", emoji: "🌻", colorA: "#baf6b0", colorB: "#4f8a43" },
  { key: "default-sunset", labelKo: "태양", labelEn: "Sun", emoji: "☀️", colorA: "#ffc28b", colorB: "#bf5f33" },
  { key: "default-dawn", labelKo: "로켓", labelEn: "Rocket", emoji: "🚀", colorA: "#ffd7a8", colorB: "#996548" },
  { key: "default-trophy", labelKo: "트로피", labelEn: "Trophy", emoji: "🏆", colorA: "#ffd873", colorB: "#8e6320" },
  { key: "default-lock", labelKo: "잠금", labelEn: "Lock", emoji: "🔒", colorA: "#b7c2cf", colorB: "#475769" },
  { key: "default-sun", labelKo: "번개", labelEn: "Bolt", emoji: "⚡", colorA: "#ffcf73", colorB: "#b86c21" },
  { key: "default-moon", labelKo: "별밤", labelEn: "Night Sky", emoji: "✨", colorA: "#a9b8ff", colorB: "#4c569c" },
  { key: "default-settings", labelKo: "게임", labelEn: "Gamepad", emoji: "🎮", colorA: "#9fe0ff", colorB: "#2b6d8d" },
  { key: "default-home", labelKo: "집", labelEn: "Home", emoji: "🏠", colorA: "#8df0c1", colorB: "#2d7756" },
  { key: "default-sound", labelKo: "음표", labelEn: "Note", emoji: "🎵", colorA: "#f6a0ef", colorB: "#8a3c91" },
  { key: "default-undo", labelKo: "타겟", labelEn: "Target", emoji: "🎯", colorA: "#9ad6ff", colorB: "#2667a0" },
  { key: "default-redo", labelKo: "여우", labelEn: "Fox", emoji: "🦊", colorA: "#ffb28e", colorB: "#a24d34" },
  { key: "default-eraser", labelKo: "판다", labelEn: "Panda", emoji: "🐼", colorA: "#d3dae7", colorB: "#546173" },
  { key: "default-honey", labelKo: "꿀", labelEn: "Honey", emoji: "🍯", colorA: "#ffd979", colorB: "#aa6a18" },
  { key: "default-tiger", labelKo: "호랑이", labelEn: "Tiger", emoji: "🐯", colorA: "#ffc48a", colorB: "#aa5c1d" },
  { key: "default-rabbit", labelKo: "토끼", labelEn: "Rabbit", emoji: "🐰", colorA: "#ffd3e7", colorB: "#b65f88" },
  { key: "default-dog", labelKo: "강아지", labelEn: "Dog", emoji: "🐶", colorA: "#ffd9b0", colorB: "#a46c3c" },
  { key: "default-wolf", labelKo: "늑대", labelEn: "Wolf", emoji: "🐺", colorA: "#c8d3e7", colorB: "#5b6b84" },
  { key: "default-koala", labelKo: "코알라", labelEn: "Koala", emoji: "🐨", colorA: "#d6dde7", colorB: "#687485" },
  { key: "default-monkey", labelKo: "원숭이", labelEn: "Monkey", emoji: "🐵", colorA: "#e6c5a1", colorB: "#8b5f36" },
  { key: "default-chick", labelKo: "병아리", labelEn: "Chick", emoji: "🐤", colorA: "#fff0a0", colorB: "#a98422" },
  { key: "default-owl", labelKo: "부엉이", labelEn: "Owl", emoji: "🦉", colorA: "#d6c4aa", colorB: "#7a5c35" },
  { key: "default-turtle", labelKo: "거북이", labelEn: "Turtle", emoji: "🐢", colorA: "#b4eb8a", colorB: "#4b8134" },
  { key: "default-crab", labelKo: "게", labelEn: "Crab", emoji: "🦀", colorA: "#ffb79b", colorB: "#ab4e38" },
  { key: "default-mushroom", labelKo: "버섯", labelEn: "Mushroom", emoji: "🍄", colorA: "#ffd5c7", colorB: "#9b493d" },
  { key: "default-cactus", labelKo: "선인장", labelEn: "Cactus", emoji: "🌵", colorA: "#b6e99a", colorB: "#487d33" },
  { key: "default-pizza", labelKo: "피자", labelEn: "Pizza", emoji: "🍕", colorA: "#ffd59e", colorB: "#ae6631" },
  { key: "default-burger", labelKo: "버거", labelEn: "Burger", emoji: "🍔", colorA: "#f2cc8d", colorB: "#8c5c2c" },
  { key: "default-donut", labelKo: "도넛", labelEn: "Donut", emoji: "🍩", colorA: "#ffbfda", colorB: "#a44a78" },
  { key: "default-ball", labelKo: "공", labelEn: "Ball", emoji: "⚽", colorA: "#d9e5ef", colorB: "#55677a" },
  { key: "default-dice", labelKo: "주사위", labelEn: "Dice", emoji: "🎲", colorA: "#ecf2f9", colorB: "#6d7d8f" },
  { key: "default-headphone", labelKo: "헤드폰", labelEn: "Headphone", emoji: "🎧", colorA: "#bdd5ff", colorB: "#4c63a7" },
  { key: "default-book", labelKo: "책", labelEn: "Book", emoji: "📚", colorA: "#ffc56b", colorB: "#8c4f1f" },
  { key: "default-pencil", labelKo: "연필", labelEn: "Pencil", emoji: "✏️", colorA: "#ffd98f", colorB: "#8a6831" },
  { key: "default-lightbulb", labelKo: "전구", labelEn: "Bulb", emoji: "💡", colorA: "#fff08b", colorB: "#a0821c" },
  { key: "default-magnet", labelKo: "자석", labelEn: "Magnet", emoji: "🧲", colorA: "#ffb4b4", colorB: "#9c4052" },
  { key: "default-anchor", labelKo: "앵커", labelEn: "Anchor", emoji: "⚓", colorA: "#c6d5e6", colorB: "#516a86" },
];
const HALL_PROFILE_AVATAR_OPTIONS = PVP_SIZE_KEYS.flatMap((sizeKey) =>
  [1, 2, 3].map((rank) => ({
    key: `hall-${sizeKey}-${rank}`,
    sizeKey,
    rank,
    group: "hall",
    labelKo: `${sizeKey} ${rank}위`,
    labelEn: `${sizeKey} Rank ${rank}`,
    unlockHintKo: `${sizeKey} 명예의 전당 ${rank}위`,
    unlockHintEn: `${sizeKey} Hall of Fame Rank ${rank}`,
    imageSrc: `/profile/hall/${sizeKey}-${rank}.png`,
  }))
);
const LEGACY_SPECIAL_AVATAR_KEY_MAP = {
  "default-rank-1": "special-rating-1",
  "default-rank-2": "special-rating-2",
  "default-rank-3": "special-rating-3",
};
const RATING_SPECIAL_PROFILE_AVATAR_OPTIONS = [1, 2, 3].map((rank) => ({
  key: `special-rating-${rank}`,
  rank,
  group: "rating",
  labelKo: `레이팅 ${rank}위`,
  labelEn: `Rating #${rank}`,
  unlockHintKo: `레이팅 랭킹 ${rank}위`,
  unlockHintEn: `Rating leaderboard #${rank}`,
  imageSrc: `/profile/special/rating-${rank}.png`,
}));
const STREAK_SPECIAL_PROFILE_AVATAR_OPTIONS = [1, 2, 3].map((rank) => ({
  key: `special-streak-${rank}`,
  rank,
  group: "streak",
  labelKo: `최다 연승 ${rank}위`,
  labelEn: `Win Streak #${rank}`,
  unlockHintKo: `최다 연승 랭킹 ${rank}위`,
  unlockHintEn: `Best win streak #${rank}`,
  imageSrc: `/profile/special/streak-${rank}.png`,
}));
const SPECIAL_PROFILE_AVATAR_OPTIONS = [
  ...HALL_PROFILE_AVATAR_OPTIONS,
  ...RATING_SPECIAL_PROFILE_AVATAR_OPTIONS,
  ...STREAK_SPECIAL_PROFILE_AVATAR_OPTIONS,
];
const PLACEMENT_REVEAL_TEST_PRESETS = [
  { key: "bronze", rating: 820, solvedSequential: 1, elapsedSec: 292 },
  { key: "silver", rating: 1280, solvedSequential: 2, elapsedSec: 268 },
  { key: "gold", rating: 1760, solvedSequential: 3, elapsedSec: 241 },
  { key: "diamond", rating: 2140, solvedSequential: 4, elapsedSec: 222 },
  { key: "master", rating: 2580, solvedSequential: 5, elapsedSec: 208 },
];
const PVP_RESULT_FX_TEST_PRESETS = [
  { key: "bronze_win", labelKo: "브론즈 승리", labelEn: "Bronze Win", from: 742, to: 781, outcome: "win" },
  { key: "silver_win", labelKo: "실버 승리", labelEn: "Silver Win", from: 1164, to: 1198, outcome: "win" },
  { key: "gold_win", labelKo: "골드 승리", labelEn: "Gold Win", from: 1738, to: 1766, outcome: "win" },
  { key: "diamond_win", labelKo: "다이아 승리", labelEn: "Diamond Win", from: 2180, to: 2211, outcome: "win" },
  { key: "promotion", labelKo: "승급 테스트", labelEn: "Promotion Test", from: 1492, to: 1524, outcome: "win" },
  { key: "demotion", labelKo: "강등 테스트", labelEn: "Demotion Test", from: 1512, to: 1481, outcome: "loss" },
];
const MATCH_SIM_PROFILE_PRESETS = [
  { key: "bronze", rating: 820 },
  { key: "silver", rating: 1240 },
  { key: "gold", rating: 1760 },
  { key: "diamond", rating: 2180 },
  { key: "master", rating: 2630 },
];
const MATCH_SIM_MAX_WAIT_SEC = 50;
const MATCH_SIM_RECENT_IDS = ["h_silver_2", "h_gold_2"];
const MATCH_FLOW_TEST_BASE_RATING = 585;
const MATCH_FLOW_TEST_OPPONENT = {
  nickname: "ghost",
  rating: 612,
  ratingRank: 84,
};
const MATCH_SIM_POOL = [
  { id: "h_bronze_1", nickname: "Damon", rating: 862, isBot: false },
  { id: "h_bronze_2", nickname: "ghost", rating: 944, isBot: false },
  { id: "h_silver_1", nickname: "yukis", rating: 1188, isBot: false },
  { id: "h_silver_2", nickname: "소나", rating: 1364, isBot: false },
  { id: "h_gold_1", nickname: "vexxxx", rating: 1682, isBot: false },
  { id: "h_gold_2", nickname: "김득완", rating: 1811, isBot: false },
  { id: "h_diamond_1", nickname: "greeedy", rating: 2094, isBot: false },
  { id: "h_diamond_2", nickname: "러브식걸", rating: 2278, isBot: false },
  { id: "h_master_1", nickname: "눈구신데요", rating: 2582, isBot: false },
  { id: "h_master_2", nickname: "1등이되겠다", rating: 2710, isBot: false },
  { id: "b_silver_1", nickname: "Mika", rating: 1290, isBot: true },
  { id: "b_gold_1", nickname: "Juno", rating: 1718, isBot: true },
  { id: "b_gold_2", nickname: "Seth", rating: 1866, isBot: true },
  { id: "b_diamond_1", nickname: "Rin", rating: 2140, isBot: true },
  { id: "b_master_1", nickname: "Nova", rating: 2594, isBot: true },
];
const MATCH_SIM_STAGE_FLOW = [
  { key: "tight", startSec: 0, labelKo: "같은 티어 · ±120", labelEn: "Same tier · ±120" },
  { key: "widen", startSec: 10, labelKo: "같은 티어 · ±220", labelEn: "Same tier · ±220" },
  { key: "adjacent", startSec: 20, labelKo: "인접 티어 · ±350", labelEn: "Adjacent tier · ±350" },
  { key: "broad", startSec: 35, labelKo: "봇 후보 포함 · ±500", labelEn: "Bots included · ±500" },
  { key: "forced", startSec: 50, labelKo: "강제 매칭", labelEn: "Forced match" },
];
const TIER_ORDER = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
  master: 4,
};

function normalizePath(pathname) {
  let path = pathname || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path === "/index.html") return "/";
  path = path.replace(/\/+$/, "");
  return path || "/";
}

function getModeFromPath(pathname) {
  const path = normalizePath(pathname);
  if (path === "/single") return "single";
  if (path === "/multi") return "multi";
  if (path === "/pvp") return "pvp";
  if (path === "/placement") return "placement_test";
  if (path === "/placement-test") return "placement_test";
  if (path === "/auth") return "auth";
  if (path === "/tutorial") return "tutorial";
  if (path === "/ranking") return "ranking";
  if (path === "/ranking-legacy") return "legacy_ranking";
  if (path === "/hall") return "replay_hall";
  return "menu";
}

function getPathFromMode(mode) {
  return MODE_TO_PATH[mode] || "/";
}

function normalizeUiLang(raw) {
  return String(raw || "").toLowerCase() === "ko" ? "ko" : "en";
}

function normalizeUiTheme(raw) {
  return String(raw || "").toLowerCase() === "dark" ? "dark" : "light";
}

function normalizeUiStyleVariant(raw) {
  return "default";
}

function getTierInfoByRating(ratingRaw, rankRaw = null) {
  const rating = Math.max(0, Math.round(Number(ratingRaw || 0)));
  if (rating >= 2500) {
    return { key: "master", labelKo: "마스터", labelEn: "Master" };
  }
  if (rating >= 2000) return { key: "diamond", labelKo: "다이아", labelEn: "Diamond" };
  if (rating >= 1500) return { key: "gold", labelKo: "골드", labelEn: "Gold" };
  if (rating >= 1000) return { key: "silver", labelKo: "실버", labelEn: "Silver" };
  return { key: "bronze", labelKo: "브론즈", labelEn: "Bronze" };
}

function isGoldOrHigherTierKey(raw) {
  const tierKey = String(raw || "").trim().toLowerCase();
  return tierKey === "gold" || tierKey === "diamond" || tierKey === "master";
}

function getAllowedPvpSizeKeys(players, viewerUser) {
  const playerTierKeys = Array.isArray(players)
    ? players
        .map((player) => getTierInfoByRating(player?.rating, player?.ratingRank).key)
        .filter(Boolean)
    : [];

  if (playerTierKeys.length >= 2) {
    return playerTierKeys.every((tierKey) => isGoldOrHigherTierKey(tierKey))
      ? PVP_SIZE_KEYS_GOLD_PLUS
      : PVP_SIZE_KEYS_LOW_TIER;
  }

  const viewerTierKey =
    String(viewerUser?.placement_tier_key || "").trim().toLowerCase() ||
    getTierInfoByRating(viewerUser?.placement_rating ?? viewerUser?.rating, viewerUser?.ratingRank).key;

  return isGoldOrHigherTierKey(viewerTierKey) ? PVP_SIZE_KEYS_GOLD_PLUS : PVP_SIZE_KEYS_LOW_TIER;
}

function parseHallProfileAvatarKey(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const normalized = LEGACY_SPECIAL_AVATAR_KEY_MAP[value] || value;
  const option = HALL_PROFILE_AVATAR_OPTIONS.find((entry) => entry.key === normalized);
  if (!option) return null;
  return option;
}

function getSpecialProfileAvatarOption(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const normalized = LEGACY_SPECIAL_AVATAR_KEY_MAP[value] || value;
  return SPECIAL_PROFILE_AVATAR_OPTIONS.find((entry) => entry.key === normalized) || null;
}

function isSpecialProfileAvatarKey(raw) {
  return !!getSpecialProfileAvatarOption(raw);
}

function getDefaultProfileAvatarOption(rawKey) {
  const key = String(rawKey || "").trim().toLowerCase();
  return DEFAULT_PROFILE_AVATAR_OPTIONS.find((option) => option.key === key) || DEFAULT_PROFILE_AVATAR_OPTIONS[0];
}

function getProfileAvatarMeta(rawKey) {
  const special = getSpecialProfileAvatarOption(rawKey);
  if (special) {
    return { type: "special", ...special };
  }
  return { type: "default", ...getDefaultProfileAvatarOption(rawKey) };
}

function normalizeProfileAvatarKey(rawKey) {
  const special = getSpecialProfileAvatarOption(rawKey);
  if (special) return special.key;
  return getDefaultProfileAvatarOption(rawKey).key;
}

function readLocalProfileAvatarOverrides() {
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_LOCAL_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getProfileAvatarOverrideStorageKey(user) {
  const id = Number(user?.id);
  if (Number.isInteger(id) && id > 0) return `id:${id}`;
  const username = String(user?.username || "").trim().toLowerCase();
  if (username) return `username:${username}`;
  return "";
}

function getLocalProfileAvatarOverride(user) {
  const key = getProfileAvatarOverrideStorageKey(user);
  if (!key) return "";
  const overrides = readLocalProfileAvatarOverrides();
  return normalizeProfileAvatarKey(overrides[key] || "");
}

function writeLocalProfileAvatarOverride(user, avatarKey) {
  const key = getProfileAvatarOverrideStorageKey(user);
  if (!key) return;
  try {
    const overrides = readLocalProfileAvatarOverrides();
    overrides[key] = normalizeProfileAvatarKey(avatarKey);
    localStorage.setItem(PROFILE_AVATAR_LOCAL_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // ignore localStorage errors
  }
}

function applyLocalProfileAvatarOverride(user) {
  if (!user || typeof user !== "object") return user;
  const override = getLocalProfileAvatarOverride(user);
  if (!override) {
    if (user.profile_avatar_key) return { ...user, profile_avatar_key: normalizeProfileAvatarKey(user.profile_avatar_key) };
    return { ...user, profile_avatar_key: DEFAULT_PROFILE_AVATAR_KEY };
  }
  return { ...user, profile_avatar_key: override };
}

function ProfileAvatar({ avatarKey, nickname = "", size = "md" }) {
  const meta = getProfileAvatarMeta(avatarKey);
  const label = nickname ? `${nickname} avatar` : "avatar";
  if (meta.type === "hall") {
    return (
      <span className={`profileAvatar profileAvatar-${size} hall`}>
        <img src={meta.imageSrc} alt={label} />
      </span>
    );
  }
  if (meta.imageSrc) {
    return (
      <span className={`profileAvatar profileAvatar-${size} defaultImageAvatar ${meta.key}`}>
        <img src={meta.imageSrc} alt={label} />
      </span>
    );
  }
  if (meta.emoji) {
    return (
      <span
        className={`profileAvatar profileAvatar-${size} defaultAvatar emojiAvatar ${meta.key}`}
        style={{ "--avatar-a": meta.colorA, "--avatar-b": meta.colorB }}
        aria-label={label}
      >
        <span className={`profileAvatarEmoji profileAvatarEmoji-${size}`}>{meta.emoji}</span>
      </span>
    );
  }
  const Icon = meta.Icon || User;
  const iconSize = size === "xl" ? 44 : size === "picker" ? 38 : size === "lg" ? 28 : size === "sm" ? 14 : 18;
  return (
    <span
      className={`profileAvatar profileAvatar-${size} defaultAvatar ${meta.key}`}
      style={{ "--avatar-a": meta.colorA, "--avatar-b": meta.colorB }}
      aria-label={label}
    >
      <Icon size={iconSize} strokeWidth={2.2} />
    </span>
  );
}

function getTierBracketInfo(ratingRaw, rankRaw = null) {
  const rating = Math.max(0, Math.round(Number(ratingRaw || 0)));
  const tier = getTierInfoByRating(rating, rankRaw);
  let min = 0;
  let max = 1000;
  let nextTier = getTierInfoByRating(1000);

  if (tier.key === "silver") {
    min = 1000;
    max = 1500;
    nextTier = getTierInfoByRating(1500);
  } else if (tier.key === "gold") {
    min = 1500;
    max = 2000;
    nextTier = getTierInfoByRating(2000);
  } else if (tier.key === "diamond") {
    min = 2000;
    max = 2500;
    nextTier = getTierInfoByRating(2500);
  } else if (tier.key === "master") {
    min = 2500;
    max = 3000;
    nextTier = null;
  }

  const span = Math.max(1, max - min);
  const progress = Math.max(0, Math.min(100, ((Math.min(rating, max) - min) / span) * 100));

  return {
    tier,
    min,
    max,
    progress,
    nextTier,
  };
}

function getMatchSimRule(waitSecRaw) {
  const waitSec = Math.max(0, Math.floor(Number(waitSecRaw || 0)));
  if (waitSec < 10) {
    return {
      key: "tight",
      maxDiff: 120,
      allowAdjacent: false,
      botsEnabled: false,
      humanChance: 0.18,
      botChance: 0,
      labelKo: "같은 티어 · ±120 · 사람만 탐색",
      labelEn: "Same tier · ±120 · human only",
    };
  }
  if (waitSec < 20) {
    return {
      key: "same_tier_wide",
      maxDiff: 220,
      allowAdjacent: false,
      botsEnabled: false,
      humanChance: 0.28,
      botChance: 0,
      labelKo: "같은 티어 · ±220 · 탐색 범위 확장",
      labelEn: "Same tier · ±220 · widened search",
    };
  }
  if (waitSec < 35) {
    return {
      key: "adjacent",
      maxDiff: 350,
      allowAdjacent: true,
      botsEnabled: false,
      humanChance: 0.4,
      botChance: 0,
      labelKo: "인접 티어 허용 · ±350",
      labelEn: "Adjacent tier allowed · ±350",
    };
  }
  if (waitSec < 50) {
    return {
      key: "broad",
      maxDiff: 500,
      allowAdjacent: true,
      botsEnabled: true,
      humanChance: 0.52,
      botChance: 0.34,
      labelKo: "넓은 탐색 · ±500 · 봇 후보 포함",
      labelEn: "Broad search · ±500 · bots included",
    };
  }
  return {
    key: "forced",
    maxDiff: 9999,
    allowAdjacent: true,
    botsEnabled: true,
    humanChance: 1,
    botChance: 1,
    labelKo: "강제 매칭 단계",
    labelEn: "Forced match stage",
  };
}

function pickMatchSimCandidate(playerRatingRaw, waitSecRaw, recentIds = MATCH_SIM_RECENT_IDS) {
  const playerRating = Math.max(0, Math.round(Number(playerRatingRaw || 0)));
  const rule = getMatchSimRule(waitSecRaw);
  const myTier = getTierInfoByRating(playerRating);
  const playerTierOrder = TIER_ORDER[myTier.key] || 0;

  const eligible = MATCH_SIM_POOL.filter((candidate) => {
    const diff = Math.abs(Number(candidate.rating) - playerRating);
    if (diff > rule.maxDiff) return false;
    const candidateTier = getTierInfoByRating(candidate.rating);
    const tierDistance = Math.abs((TIER_ORDER[candidateTier.key] || 0) - playerTierOrder);
    if (rule.allowAdjacent) return tierDistance <= 1;
    return tierDistance === 0;
  });

  const humans = eligible
    .filter((candidate) => !candidate.isBot && !recentIds.includes(candidate.id))
    .map((candidate) => ({
      ...candidate,
      tier: getTierInfoByRating(candidate.rating),
      source: "human",
      score: Math.abs(candidate.rating - playerRating) + Math.random() * 38,
    }))
    .sort((a, b) => a.score - b.score);

  if (humans.length > 0 && (Math.random() < rule.humanChance || rule.key === "forced")) {
    return {
      ...humans[0],
      matchedAtSec: Math.max(1, Math.floor(Number(waitSecRaw || 0))),
      reasonKo: "사람 우선 규칙으로 매칭",
      reasonEn: "Matched through human-first search",
      rule,
    };
  }

  if (!rule.botsEnabled) return null;

  const bots = eligible
    .filter((candidate) => candidate.isBot)
    .map((candidate) => ({
      ...candidate,
      tier: getTierInfoByRating(candidate.rating),
      source: "bot",
      score: Math.abs(candidate.rating - playerRating) + Math.random() * 54,
    }))
    .sort((a, b) => a.score - b.score);

  if (bots.length > 0 && (Math.random() < rule.botChance || rule.key === "forced")) {
    return {
      ...bots[0],
      matchedAtSec: Math.max(1, Math.floor(Number(waitSecRaw || 0))),
      reasonKo: "대기 시간이 길어져 봇 후보까지 포함",
      reasonEn: "Queue widened to bot candidates after waiting",
      rule,
    };
  }

  return null;
}

function getMatchSimQueueSize(waitSecRaw, playerRatingRaw = 1500) {
  const waitSec = Math.max(0, Math.floor(Number(waitSecRaw || 0)));
  const tier = getTierInfoByRating(playerRatingRaw);
  const tierBoost =
    tier.key === "bronze"
      ? 2
      : tier.key === "silver"
        ? 3
        : tier.key === "gold"
          ? 4
          : tier.key === "diamond"
            ? 3
            : 2;
  const wave = [0, 1, 0, 2, 1, 0, 3, 1][waitSec % 8];
  const widenBoost = waitSec >= 35 ? 2 : waitSec >= 20 ? 1 : 0;
  return Math.max(1, Math.min(9, tierBoost + wave + widenBoost));
}

function getMatchSimOutcomeTarget(fromRatingRaw, mode) {
  const from = Math.max(0, Math.round(Number(fromRatingRaw || 0)));
  const bracket = getTierBracketInfo(from);
  if (mode === "promotion") {
    if (bracket.tier.key === "master") {
      return { to: from + 36, result: "win" };
    }
    return { to: Math.max(from + 18, bracket.max + 18), result: "win" };
  }
  if (mode === "demotion") {
    if (bracket.min <= 0) {
      return { to: Math.max(0, from - 32), result: "loss" };
    }
    return { to: Math.max(0, bracket.min - 22), result: "loss" };
  }
  if (mode === "loss") {
    const lossValue = from >= 2500 ? 22 : from >= 2000 ? 20 : from >= 1500 ? 18 : 16;
    return { to: Math.max(0, from - lossValue), result: "loss" };
  }
  const winValue = from >= 2500 ? 24 : from >= 2000 ? 28 : from >= 1500 ? 32 : 36;
  return { to: from + winValue, result: "win" };
}

function evaluatePlacementResult(rawResults, elapsedSecRaw, currentStageProgressRaw = 0) {
  const elapsedSec = Math.max(1, Math.min(PLACEMENT_TIME_LIMIT_SEC, Math.floor(Number(elapsedSecRaw || 0))));
  const currentStageProgress = Math.max(0, Math.min(1, Number(currentStageProgressRaw || 0)));
  const results = Array.isArray(rawResults) ? rawResults : [];
  let solvedSequential = 0;
  for (const r of results) {
    if (r?.status === "solved") solvedSequential += 1;
    else break;
  }

  let minRating = 0;
  let maxRating = 999;
  if (solvedSequential >= 5) {
    minRating = 2210;
    maxRating = 2499;
  } else if (solvedSequential === 4) {
    minRating = 1760;
    maxRating = 1995;
  } else if (solvedSequential === 3) {
    minRating = 1220;
    maxRating = 1589;
  } else if (solvedSequential === 2) {
    minRating = 820;
    maxRating = 1099;
  } else if (solvedSequential === 1) {
    minRating = 420;
    maxRating = 959;
  } else {
    minRating = 0;
    maxRating = 519;
  }

  const timeScore = Math.max(0, Math.min(1, (PLACEMENT_TIME_LIMIT_SEC - elapsedSec) / PLACEMENT_TIME_LIMIT_SEC));
  const performance = Math.max(0, Math.min(1, 0.14 + 0.72 * Math.sqrt(timeScore)));

  const currentStage = results[solvedSequential];
  const hasPendingCurrent = currentStage && currentStage.status === "pending";
  const stageProgress = hasPendingCurrent ? currentStageProgress : 0;
  const stageBonusCap =
    solvedSequential >= 4 ? 90 : solvedSequential === 3 ? 85 : solvedSequential === 2 ? 70 : solvedSequential === 1 ? 44 : 28;
  const stageProgressBonus = Math.round(stageBonusCap * Math.pow(stageProgress, 0.96));

  const rating = Math.round(
    Math.max(0, Math.min(2499, minRating + (maxRating - minRating) * performance + stageProgressBonus))
  );
  const tier = getTierInfoByRating(rating);
  return {
    rating,
    tier,
    solvedSequential,
    elapsedSec,
    timeScore,
    performance,
    stageProgress,
    stageProgressBonus,
  };
}

function toSheetColumnLabel(index) {
  let n = Number(index) + 1;
  if (!Number.isFinite(n) || n <= 0) return "";
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
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

function readInitialSoundVolume() {
  const saved = localStorage.getItem(SOUND_KEY);
  if (saved == null) return 100;
  const v = String(saved).trim().toLowerCase();
  if (v === "off") return 0;
  if (v === "on") return 100;
  return normalizeUiSoundVolume(v);
}

const TUTORIAL_PUZZLE = {
  id: "tutorial-5x5",
  width: 5,
  height: 5,
  row_hints: [[1, 1], [5], [5], [1, 1, 1], [3]],
  col_hints: [[3], [3, 1], [4], [3, 1], [3]],
};

const TUTORIAL_GUIDE_STEPS = [
  {
    key: "row2full",
    title: "2번째 줄 힌트 5",
    prompt: "힌트가 5라서 이 줄은 빈칸 없이 꽉 찹니다. 2번째 줄을 모두 채우세요.",
    promptEn: "Hint 5 means the entire row is filled. Paint all cells in row 2.",
    rowHighlights: [1],
    fill: [5, 6, 7, 8, 9],
  },
  {
    key: "row3full",
    title: "3번째 줄 힌트 5",
    prompt: "위쪽이 이미 확정돼 경계가 잡혔어요. 3번째 줄도 전부 채우면 됩니다.",
    promptEn: "The boundary is already fixed from above, so row 3 is also fully filled.",
    rowHighlights: [2],
    fill: [10, 11, 12, 13, 14],
  },
  {
    key: "row4gaps",
    title: "4번째 줄 힌트 1 1 1",
    prompt: "힌트 1-1-1은 각 칸이 떨어져야 하니, 사이칸(2칸·4칸)을 X로 막아주세요.",
    promptEn: "For clue 1-1-1, each filled cell must be separated. Mark gaps (2nd, 4th) with X.",
    rowHighlights: [3],
    mark: [16, 18],
    cellHighlights: [16, 18],
  },
  {
    key: "row4fills",
    title: "4번째 줄 채우기",
    prompt: "막힌 칸 사이로 가능한 자리가 확정됐습니다. 1·3·5칸을 채우세요.",
    promptEn: "Now only the valid slots remain between blocked cells. Fill 1st, 3rd, and 5th.",
    rowHighlights: [3],
    fill: [15, 17, 19],
    cellHighlights: [15, 17, 19],
  },
  {
    key: "row1pair",
    title: "1번째 줄 힌트 1 1",
    prompt: "아래 줄이 이미 막고 있어서 더 내려갈 수 없어요. 1번째 줄은 가운데 두 칸만 채우면 1,1이 맞습니다.",
    promptEn: "The row below blocks further expansion, so only the two center cells fit clue 1,1.",
    rowHighlights: [0],
    fill: [1, 3],
    cellHighlights: [1, 3],
  },
  {
    key: "row5three",
    title: "5번째 줄 힌트 3",
    prompt: "세로 힌트와 맞춰보면 마지막 줄은 중앙 3칸만 가능합니다. 가운데 3칸을 채우세요.",
    promptEn: "Cross-checking column clues, only the middle three cells are possible in the last row.",
    rowHighlights: [4],
    fill: [21, 22, 23],
    cellHighlights: [21, 22, 23],
  },
  {
    key: "finish",
    title: "완성",
    prompt: "좋아요. 논리대로 모두 맞췄고 퍼즐이 완성됐습니다.",
    promptEn: "Great. You solved the puzzle logically and completed it.",
    requireSolved: true,
  },
];

function toBase64Bits(cells, width, height) {
  const byteLength = Math.ceil((width * height) / 8);
  const out = new Uint8Array(byteLength);

  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === 1) {
      out[Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }

  let binary = "";
  for (const b of out) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64Bits(bitsBase64, width, height) {
  const total = width * height;
  const cells = new Array(total).fill(0);
  if (!bitsBase64 || typeof bitsBase64 !== "string") return cells;
  let binary = "";
  try {
    binary = atob(bitsBase64);
  } catch {
    return cells;
  }
  const byteLen = Math.ceil(total / 8);
  for (let i = 0; i < total; i += 1) {
    const b = i < byteLen ? (binary.charCodeAt(Math.floor(i / 8)) || 0) : 0;
    cells[i] = ((b >> (i % 8)) & 1) === 1 ? 1 : 0;
  }
  return cells;
}

function getRuns(line) {
  const runs = [];
  let count = 0;
  for (const v of line) {
    if (v === 1) count += 1;
    else if (count > 0) {
      runs.push(count);
      count = 0;
    }
  }
  if (count > 0) runs.push(count);
  return runs;
}

function cluesEqual(line, clues) {
  const runs = getRuns(line);
  if (runs.length !== clues.length) return false;
  for (let i = 0; i < runs.length; i += 1) {
    if (runs[i] !== clues[i]) return false;
  }
  return true;
}

async function parseJsonSafe(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  const url = String(res?.url || "");
  throw new Error(
    `Server returned non-JSON response (${res.status})${url ? ` [${url}]` : ""}: ${text.slice(0, 120)}`
  );
}

function isRaceOnlyStatusMessage(message) {
  if (!message) return false;
  return (
    message === "승리하였습니다." ||
    message === "패배하였습니다." ||
    message === "완주! 다른 플레이어 결과 대기중..." ||
    message === "5초 후 시작합니다." ||
    message === "Victory." ||
    message === "Defeat." ||
    message === "Finished! Waiting for other players..." ||
    message === "Starting in 5 seconds."
  );
}

function App() {
  const [playMode, setPlayMode] = useState(() => {
    if (typeof window === "undefined") return "menu";
    return getModeFromPath(window.location.pathname);
  }); // menu | single | multi | pvp | tutorial | auth | ranking | replay_hall
  const [selectedSize, setSelectedSize] = useState("25x25");
  const [puzzle, setPuzzle] = useState(null);
  const [cells, setCells] = useState([]); // 0 empty, 1 filled, 2 marked(X)
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeHints, setActiveHints] = useState(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [raceRoomCode, setRaceRoomCode] = useState("");
  const [racePlayerId, setRacePlayerId] = useState("");
  const [raceState, setRaceState] = useState(null);
  const [raceSubmitting, setRaceSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createRoomTitle, setCreateRoomTitle] = useState("");
  const [createSize, setCreateSize] = useState("10x10");
  const [createMaxPlayers, setCreateMaxPlayers] = useState("2");
  const [createVisibility, setCreateVisibility] = useState("public");
  const [createPassword, setCreatePassword] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinRoomType, setJoinRoomType] = useState("unknown"); // unknown | public | private
  const [joinModalSource, setJoinModalSource] = useState("manual"); // manual | list
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [ratingUsers, setRatingUsers] = useState([]);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [myRatingRank, setMyRatingRank] = useState(null);
  const [ratingTotalUsers, setRatingTotalUsers] = useState(0);
  const [hallDataBySize, setHallDataBySize] = useState({});
  const [hallStreakTop, setHallStreakTop] = useState([]);
  const [hallActiveSizeKey, setHallActiveSizeKey] = useState("10x10");
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState("");
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "ko" ? "ko" : "en";
  });
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  const [uiStyleVariant, setUiStyleVariant] = useState(() =>
    normalizeUiStyleVariant(localStorage.getItem(STYLE_VARIANT_KEY))
  );
  const [authToken, setAuthToken] = useState(localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? applyLocalProfileAvatarOverride(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [authTab, setAuthTab] = useState("login"); // login | signup
  const [authReturnMode, setAuthReturnMode] = useState("menu");
  const [showNeedLoginPopup, setShowNeedLoginPopup] = useState(false);
  const [needLoginReturnMode, setNeedLoginReturnMode] = useState("multi");
  const [showPlacementRequiredPopup, setShowPlacementRequiredPopup] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [activeVote, setActiveVote] = useState(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState("");
  const [showPvpTierGuideModal, setShowPvpTierGuideModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState({ username: "", password: "" });
  const [signupUsername, setSignupUsername] = useState("");
  const [signupNickname, setSignupNickname] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupFieldErrors, setSignupFieldErrors] = useState({
    username: "",
    nickname: "",
    password: "",
    terms: "",
    privacy: "",
  });
  const [signupAgreeTerms, setSignupAgreeTerms] = useState(false);
  const [signupAgreePrivacy, setSignupAgreePrivacy] = useState(false);
  const [signupPolicyModal, setSignupPolicyModal] = useState(""); // "" | terms | privacy
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mobilePaintMode, setMobilePaintMode] = useState("fill"); // fill | mark
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [mobileBoardScale, setMobileBoardScale] = useState(1);
  const [mobileBoardFocus, setMobileBoardFocus] = useState(false);
  const [showMultiResultModal, setShowMultiResultModal] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [soundVolume, setSoundVolume] = useState(() => readInitialSoundVolume());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({
    lang: "en",
    theme: "light",
    soundVolume: 100,
  });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalMode, setProfileModalMode] = useState("self"); // self | public
  const [profileModalLoading, setProfileModalLoading] = useState(false);
  const [profileModalSaving, setProfileModalSaving] = useState(false);
  const [profileModalError, setProfileModalError] = useState("");
  const [profileModalData, setProfileModalData] = useState(null);
  const [profileDraftAvatarKey, setProfileDraftAvatarKey] = useState(DEFAULT_PROFILE_AVATAR_KEY);
  const [profileAvatarTab, setProfileAvatarTab] = useState("default"); // default | special
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [publicProfileAvatarCache, setPublicProfileAvatarCache] = useState({});
  const [pvpTicketId, setPvpTicketId] = useState("");
  const [pvpSearching, setPvpSearching] = useState(false);
  const [pvpQueueSize, setPvpQueueSize] = useState(0);
  const [pvpServerState, setPvpServerState] = useState("idle"); // idle | waiting | matching | ready | cancelled
  const [pvpMatch, setPvpMatch] = useState(null);
  const [pvpAcceptBusy, setPvpAcceptBusy] = useState(false);
  const [pvpBanBusy, setPvpBanBusy] = useState(false);
  const [pvpRevealIndex, setPvpRevealIndex] = useState(0);
  const [pvpRatingFx, setPvpRatingFx] = useState(null);
  const [pvpShowdownMatchId, setPvpShowdownMatchId] = useState("");
  const [pvpShowdownUntilMs, setPvpShowdownUntilMs] = useState(0);
  const [placementRunning, setPlacementRunning] = useState(false);
  const [placementLoading, setPlacementLoading] = useState(false);
  const [placementStartedAtMs, setPlacementStartedAtMs] = useState(0);
  const [placementStageIndex, setPlacementStageIndex] = useState(0);
  const [placementResults, setPlacementResults] = useState(() =>
    PLACEMENT_STAGES.map((s) => ({ ...s, status: "pending", solvedAtSec: null }))
  );
  const [placementResultCard, setPlacementResultCard] = useState(null);
  const [placementRevealOpen, setPlacementRevealOpen] = useState(false);
  const [placementRevealPhase, setPlacementRevealPhase] = useState("idle"); // idle | analyzing | counting | reveal
  const [placementRevealRating, setPlacementRevealRating] = useState(0);
  const [matchSimProfileKey, setMatchSimProfileKey] = useState("gold");
  const [matchSimRating, setMatchSimRating] = useState(() => MATCH_SIM_PROFILE_PRESETS.find((item) => item.key === "gold")?.rating || 1760);
  const [matchSimSearching, setMatchSimSearching] = useState(false);
  const [matchSimElapsedSec, setMatchSimElapsedSec] = useState(0);
  const [matchSimQueueSize, setMatchSimQueueSize] = useState(() => getMatchSimQueueSize(0, 1760));
  const [matchSimLogs, setMatchSimLogs] = useState([]);
  const [matchSimFound, setMatchSimFound] = useState(null);
  const [matchFlowTest, setMatchFlowTest] = useState(null);
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const chatBodyRef = useRef(null);
  const emojiWrapRef = useRef(null);
  const dragRef = useRef(null); // { button: 'left'|'right', paintValue, ignoreButtons }
  const lastPaintIndexRef = useRef(null);
  const strokeBaseRef = useRef(null);
  const strokeChangedRef = useRef(false);
  const cellValuesRef = useRef([]);
  const pendingPaintRef = useRef(new Map());
  const frameRef = useRef(0);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const autoSolvedShownRef = useRef(false);
  const racePollRef = useRef(0);
  const pvpPollRef = useRef(0);
  const pvpRevealAnimRef = useRef(0);
  const placementSessionRef = useRef(0);
  const matchSimSessionRef = useRef(0);
  const matchSimElapsedRef = useRef(0);
  const matchSimLastRuleKeyRef = useRef("");
  const matchFlowTimersRef = useRef([]);
  const matchFlowRevealRef = useRef(0);
  const raceRoomCodeRef = useRef("");
  const racePlayerIdRef = useRef("");
  const pvpTicketRef = useRef("");
  const pvpMatchPhaseRef = useRef("");
  const pvpRevealSpinPrevRef = useRef(false);
  const pvpRatingAnimRef = useRef(0);
  const pvpRatingBaseRef = useRef(null);
  const pvpRatingBaseGamesRef = useRef(null);
  const pvpRatingFxDoneRoomRef = useRef("");
  const pvpAuthRefreshDoneRoomRef = useRef("");
  const pvpShowdownSeenRef = useRef("");
  const votePromptedTokenRef = useRef("");
  const raceFinishedSentRef = useRef(false);
  const raceResultShownRef = useRef(false);
  const raceProgressLastSentRef = useRef(0);
  const raceProgressBusyRef = useRef(false);
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const countdownCueRef = useRef(-1);
  const inactivityWarnCueRef = useRef(-1);
  const prevRacePhaseRef = useRef("idle");
  const lastPaintSfxAtRef = useRef(0);
  const tutorialCompleteShownRef = useRef(false);
  const multiResultShownKeyRef = useRef("");
  const deferredCells = useDeferredValue(cells);
  const L = (ko, en) => (lang === "ko" ? ko : en);

  const applyUiPreferences = (prefUser) => {
    if (!prefUser || typeof prefUser !== "object") return;
    setLang(normalizeUiLang(prefUser.ui_lang));
    setIsDarkMode(normalizeUiTheme(prefUser.ui_theme) === "dark");
    setSoundVolume(normalizeUiSoundVolume(prefUser.ui_sound_volume, prefUser.ui_sound_on));
  };

  const cacheAuthUser = (user, { applyPrefs = false } = {}) => {
    const nextUser = applyLocalProfileAvatarOverride(user);
    setAuthUser(nextUser);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
    if (applyPrefs) applyUiPreferences(nextUser);
  };

  const mapHallBucketsFromResponse = (sizesRaw) => {
    const mapped = {};
    for (const key of PVP_SIZE_KEYS) mapped[key] = [];
    const sizes = Array.isArray(sizesRaw) ? sizesRaw : [];
    for (const bucket of sizes) {
      const sizeKey = String(bucket?.sizeKey || "");
      if (!sizeKey || !mapped[sizeKey]) continue;
      const top = Array.isArray(bucket?.top) ? bucket.top : [];
      mapped[sizeKey] = top.slice(0, 3).map((r, idx) => ({
        recordId: Number(r.recordId || 0),
        rank: Number(r.rank || idx + 1),
        userId: Number(r.userId || 0),
        nickname: String(r.nickname || ""),
        elapsedSec: Number(r.elapsedSec || 0),
        elapsedMs: Number(r.elapsedMs || 0),
        puzzleId: Number(r.puzzleId || 0),
        finishedAtMs: Number(r.finishedAtMs || 0),
        sizeKey,
      }));
    }
    return mapped;
  };

  const hasHallSnapshot = (snapshot) =>
    PVP_SIZE_KEYS.some((sizeKey) => Array.isArray(snapshot?.[sizeKey]) && snapshot[sizeKey].length > 0);
  const hasStreakSnapshot = (snapshot) => Array.isArray(snapshot) && snapshot.length > 0;
  const hasRatingSnapshot = (snapshot) => Array.isArray(snapshot) && snapshot.length > 0;

  const buildHallRewardsFromSnapshot = (snapshot, target) => {
    const targetUserId = Number(target?.id || target?.userId || 0);
    const targetNickname = String(target?.nickname || "").trim().toLowerCase();
    const rewards = [];
    for (const sizeKey of PVP_SIZE_KEYS) {
      const records = Array.isArray(snapshot?.[sizeKey]) ? snapshot[sizeKey] : [];
      for (const record of records) {
        const recordUserId = Number(record?.userId || 0);
        const recordNickname = String(record?.nickname || "").trim().toLowerCase();
        const matched =
          (targetUserId > 0 && recordUserId > 0 && targetUserId === recordUserId) ||
          (!!targetNickname && targetNickname === recordNickname);
        if (!matched) continue;
        const rank = Math.max(1, Math.min(3, Number(record?.rank || 0) || 1));
        rewards.push({
          key: `hall-${sizeKey}-${rank}`,
          sizeKey,
          rank,
          elapsedSec: Number(record?.elapsedSec || 0),
          finishedAtMs: Number(record?.finishedAtMs || 0),
        });
      }
    }
    const unique = new Map();
    for (const reward of rewards) {
      const prev = unique.get(reward.key);
      if (!prev || Number(reward.elapsedSec || 0) < Number(prev.elapsedSec || 0)) {
        unique.set(reward.key, reward);
      }
    }
    return Array.from(unique.values()).sort((a, b) => {
      const sizeDiff = PVP_SIZE_KEYS.indexOf(a.sizeKey) - PVP_SIZE_KEYS.indexOf(b.sizeKey);
      if (sizeDiff !== 0) return sizeDiff;
      return Number(a.rank || 0) - Number(b.rank || 0);
    });
  };

  const buildRatingRewardsFromSnapshot = (snapshot, target) => {
    const targetUserId = Number(target?.id || target?.userId || 0);
    const targetNickname = String(target?.nickname || "").trim().toLowerCase();
    return (Array.isArray(snapshot) ? snapshot : [])
      .slice(0, 3)
      .map((entry, idx) => ({
        rank: Number(entry?.rank || idx + 1),
        userId: Number(entry?.id || entry?.userId || 0),
        nickname: String(entry?.nickname || "").trim().toLowerCase(),
      }))
      .filter((entry) =>
        (targetUserId > 0 && entry.userId > 0 && targetUserId === entry.userId) ||
        (!!targetNickname && targetNickname === entry.nickname)
      )
      .map((entry) => ({
        key: `special-rating-${Math.max(1, Math.min(3, entry.rank))}`,
        group: "rating",
        rank: Math.max(1, Math.min(3, entry.rank)),
      }));
  };

  const buildStreakRewardsFromSnapshot = (snapshot, target) => {
    const targetUserId = Number(target?.id || target?.userId || 0);
    const targetNickname = String(target?.nickname || "").trim().toLowerCase();
    return (Array.isArray(snapshot) ? snapshot : [])
      .slice(0, 3)
      .map((entry, idx) => ({
        rank: Number(entry?.rank || idx + 1),
        userId: Number(entry?.userId || 0),
        nickname: String(entry?.nickname || "").trim().toLowerCase(),
        winStreakBest: Number(entry?.winStreakBest || 0),
      }))
      .filter((entry) =>
        ((targetUserId > 0 && entry.userId > 0 && targetUserId === entry.userId) ||
          (!!targetNickname && targetNickname === entry.nickname)) &&
        entry.winStreakBest > 0
      )
      .map((entry) => ({
        key: `special-streak-${Math.max(1, Math.min(3, entry.rank))}`,
        group: "streak",
        rank: Math.max(1, Math.min(3, entry.rank)),
        winStreakBest: entry.winStreakBest,
      }));
  };

  const mergeSpecialRewards = (...groups) => {
    const unique = new Map();
    for (const reward of groups.flat().filter(Boolean)) {
      if (!reward?.key) continue;
      if (!unique.has(reward.key)) unique.set(reward.key, reward);
    }
    const orderedKeys = SPECIAL_PROFILE_AVATAR_OPTIONS.map((option) => option.key);
    return Array.from(unique.values()).sort((a, b) => orderedKeys.indexOf(a.key) - orderedKeys.indexOf(b.key));
  };

  const ensureHallSnapshotForProfile = async () => {
    if (hasHallSnapshot(hallDataBySize) || hasStreakSnapshot(hallStreakTop)) {
      return { sizes: hallDataBySize, streakTop: hallStreakTop };
    }
    try {
      const res = await fetch(`${API_BASE}/replays/hall`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load Hall of Fame records.");
      const mapped = mapHallBucketsFromResponse(data.sizes);
      const streakTopRaw = Array.isArray(data?.streakTop) ? data.streakTop : [];
      const streakTop = streakTopRaw
        .map((r, idx) => ({
          rank: Number(r.rank || idx + 1),
          userId: Number(r.userId || 0),
          nickname: String(r.nickname || ""),
          winStreakBest: Number(r.winStreakBest || 0),
        }))
        .filter((r) => r.winStreakBest > 0)
        .slice(0, 3);
      setHallDataBySize(mapped);
      setHallStreakTop(streakTop);
      return { sizes: mapped, streakTop };
    } catch {
      return { sizes: hallDataBySize, streakTop: hallStreakTop };
    }
  };

  const ensureRatingSnapshotForProfile = async () => {
    if (hasRatingSnapshot(ratingUsers)) return ratingUsers;
    try {
      const res = await fetch(`${API_BASE}/ratings/leaderboard?limit=200`, {
        headers: { ...authHeaders },
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load ranking");
      const users = Array.isArray(data.users) ? data.users : [];
      setRatingUsers(users);
      setMyRatingRank(Number.isInteger(Number(data.myRank)) ? Number(data.myRank) : null);
      setRatingTotalUsers(Number.isInteger(Number(data.totalUsers)) ? Number(data.totalUsers) : 0);
      return users;
    } catch {
      return ratingUsers;
    }
  };

  const buildSelfProfileFallback = (
    userOverride = null,
    rewardSnapshot = { sizes: hallDataBySize, streakTop: hallStreakTop },
    ratingSnapshot = ratingUsers
  ) => {
    const baseUser = applyLocalProfileAvatarOverride(userOverride || authUser || {});
    const wins = Number(baseUser?.rating_wins || 0);
    const losses = Number(baseUser?.rating_losses || 0);
    const games = Number(baseUser?.rating_games || wins + losses || 0);
    const hallRewards = buildHallRewardsFromSnapshot(rewardSnapshot?.sizes || {}, {
      id: baseUser?.id,
      nickname: baseUser?.nickname,
    });
    const specialRewards = mergeSpecialRewards(
      hallRewards,
      buildRatingRewardsFromSnapshot(ratingSnapshot, { id: baseUser?.id, nickname: baseUser?.nickname }),
      buildStreakRewardsFromSnapshot(rewardSnapshot?.streakTop || [], { id: baseUser?.id, nickname: baseUser?.nickname })
    );
    return {
      id: Number(baseUser?.id || 0),
      username: String(baseUser?.username || ""),
      nickname: String(baseUser?.nickname || L("플레이어", "Player")),
      isBot: false,
      rating: Number(baseUser?.rating || 0),
      ratingRank: Number.isInteger(Number(myRatingRank)) ? Number(myRatingRank) : null,
      rating_games: games,
      rating_wins: wins,
      rating_losses: losses,
      win_streak_current: Number(baseUser?.win_streak_current || 0),
      win_streak_best: Number(baseUser?.win_streak_best || 0),
      winRate: games > 0 ? (wins / games) * 100 : 0,
      profile_avatar_key: normalizeProfileAvatarKey(baseUser?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY),
      hallRewards,
      specialRewards,
      unlockedHallAvatarKeys: hallRewards.map((reward) => reward.key),
      unlockedSpecialAvatarKeys: specialRewards.map((reward) => reward.key),
    };
  };

  const buildPublicProfileFallback = (
    userId,
    rewardSnapshot = { sizes: hallDataBySize, streakTop: hallStreakTop },
    ratingSnapshot = ratingUsers,
    sourceOverride = null
  ) => {
    const targetUserId = Number(userId || sourceOverride?.userId || sourceOverride?.id || 0);
    const racePlayer =
      targetUserId > 0 ? (raceState?.players || []).find((player) => Number(player?.userId) === targetUserId) : null;
    const pvpPlayer =
      targetUserId > 0 ? (pvpMatch?.players || []).find((player) => Number(player?.userId) === targetUserId) : null;
    const ratingUser =
      targetUserId > 0 ? (ratingSnapshot || []).find((player) => Number(player?.id) === targetUserId) : null;
    const source = sourceOverride || ratingUser || pvpPlayer || racePlayer || null;
    if (!source) return null;
    const wins = Number(source?.rating_wins || 0);
    const losses = Number(source?.rating_losses || 0);
    const games = Number(source?.rating_games || wins + losses || 0);
    const hallRewards = buildHallRewardsFromSnapshot(rewardSnapshot?.sizes || {}, {
      id: targetUserId,
      nickname: source?.nickname,
    });
    const specialRewards = mergeSpecialRewards(
      hallRewards,
      buildRatingRewardsFromSnapshot(ratingSnapshot, { id: targetUserId, nickname: source?.nickname }),
      buildStreakRewardsFromSnapshot(rewardSnapshot?.streakTop || [], { id: targetUserId, nickname: source?.nickname })
    );
    return {
      id: targetUserId > 0 ? targetUserId : Number(source?.id || source?.userId || 0),
      nickname: String(source?.nickname || L("플레이어", "Player")),
      isBot: Boolean(source?.isBot),
      rating: Number(source?.rating || 0),
      ratingRank:
        ratingUser && Array.isArray(ratingSnapshot) && ratingSnapshot.length > 0
          ? ratingSnapshot.findIndex((player) => Number(player?.id) === targetUserId) + 1 || null
          : Number.isInteger(Number(source?.ratingRank))
            ? Number(source?.ratingRank)
            : null,
      rating_games: games,
      rating_wins: wins,
      rating_losses: losses,
      win_streak_current: Number(source?.win_streak_current || 0),
      win_streak_best: Number(source?.win_streak_best || 0),
      winRate: games > 0 ? (wins / games) * 100 : 0,
      profile_avatar_key: normalizeProfileAvatarKey(source?.profileAvatarKey || source?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY),
      hallRewards,
      specialRewards,
      unlockedHallAvatarKeys: hallRewards.map((reward) => reward.key),
      unlockedSpecialAvatarKeys: specialRewards.map((reward) => reward.key),
    };
  };

  const openSettingsModal = () => {
    setSettingsError("");
    setSettingsDraft({
      lang,
      theme: isDarkMode ? "dark" : "light",
      soundVolume,
    });
    setShowSettingsModal(true);
  };

  const saveSettings = async () => {
    const nextUiTheme = settingsDraft.theme === "dark" ? "dark" : "light";
    const nextStyleVariant = "default";
    const payload = {
      ui_lang: normalizeUiLang(settingsDraft.lang),
      ui_theme: normalizeUiTheme(nextUiTheme),
      ui_sound_volume: normalizeUiSoundVolume(settingsDraft.soundVolume),
    };
    setSettingsError("");
    setSettingsSaving(true);
    try {
      if (isLoggedIn) {
        const res = await fetch(`${API_BASE}/auth/preferences`, {
          method: "PUT",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok) throw new Error(data.error || L("설정 저장 실패", "Failed to save settings"));
        cacheAuthUser(data.user, { applyPrefs: true });
      } else {
        setLang(payload.ui_lang);
        setIsDarkMode(payload.ui_theme === "dark");
        setSoundVolume(payload.ui_sound_volume);
      }
      setUiStyleVariant(nextStyleVariant);
      setShowSettingsModal(false);
      setStatus(L("설정이 저장되었습니다.", "Settings saved."));
    } catch (err) {
      setSettingsError(String(err.message || L("설정 저장 실패", "Failed to save settings")));
    } finally {
      setSettingsSaving(false);
    }
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setProfileModalLoading(false);
    setProfileModalSaving(false);
    setProfileModalError("");
    setProfileModalData(null);
    setProfileDraftAvatarKey(DEFAULT_PROFILE_AVATAR_KEY);
    setProfileAvatarTab("default");
    setProfilePickerOpen(false);
  };

  const openOwnProfile = async () => {
    if (!isLoggedIn) return;
    setShowProfileModal(true);
    setProfileModalMode("self");
    setProfileModalLoading(true);
    setProfileModalSaving(false);
    setProfileModalError("");
    setProfileModalData(null);
    const initialAvatarKey = normalizeProfileAvatarKey(authUser?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY);
    setProfileDraftAvatarKey(initialAvatarKey);
    setProfileAvatarTab(isSpecialProfileAvatarKey(initialAvatarKey) ? "special" : "default");
    setProfilePickerOpen(false);
    try {
      const res = await fetch(`${API_BASE}/profile/me`, { headers: { ...authHeaders } });
      if (res.status === 404) {
        const rewardSnapshot = await ensureHallSnapshotForProfile();
        const ratingSnapshot = await ensureRatingSnapshotForProfile();
        const fallbackProfile = buildSelfProfileFallback(null, rewardSnapshot, ratingSnapshot);
        setProfileModalData(fallbackProfile);
        setProfileDraftAvatarKey(normalizeProfileAvatarKey(fallbackProfile.profile_avatar_key));
        if (fallbackProfile.unlockedSpecialAvatarKeys.length > 0) {
          setProfileAvatarTab("special");
        }
        return;
      }
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("프로필 정보를 불러오지 못했습니다.", "Failed to load profile."));
      const profile = data.profile || null;
      const nextAvatarKey = normalizeProfileAvatarKey(profile?.profile_avatar_key || authUser?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY);
      setProfileModalData(profile);
      setProfileDraftAvatarKey(nextAvatarKey);
      setProfileAvatarTab(isSpecialProfileAvatarKey(nextAvatarKey) ? "special" : "default");
    } catch (err) {
      const rewardSnapshot = await ensureHallSnapshotForProfile();
      const ratingSnapshot = await ensureRatingSnapshotForProfile();
      const fallbackProfile = buildSelfProfileFallback(null, rewardSnapshot, ratingSnapshot);
      setProfileModalData(fallbackProfile);
      const nextAvatarKey = normalizeProfileAvatarKey(fallbackProfile.profile_avatar_key);
      setProfileDraftAvatarKey(nextAvatarKey);
      setProfileAvatarTab(
        isSpecialProfileAvatarKey(nextAvatarKey) || fallbackProfile.unlockedSpecialAvatarKeys.length > 0 ? "special" : "default"
      );
      setProfileModalError("");
    } finally {
      setProfileModalLoading(false);
    }
  };

  const openPublicProfile = async (userId, sourceOverride = null) => {
    const nextUserId = Number(userId || sourceOverride?.userId || sourceOverride?.id || 0);
    if (!Number.isInteger(nextUserId) || nextUserId <= 0) {
      if (sourceOverride) {
        const rewardSnapshot = await ensureHallSnapshotForProfile();
        const ratingSnapshot = await ensureRatingSnapshotForProfile();
        const fallbackProfile = buildPublicProfileFallback(0, rewardSnapshot, ratingSnapshot, sourceOverride);
        if (fallbackProfile) {
          setShowProfileModal(true);
          setProfileModalMode("public");
          setProfileModalLoading(false);
          setProfileModalSaving(false);
          setProfileModalError("");
          setProfileModalData(fallbackProfile);
          setProfileDraftAvatarKey(normalizeProfileAvatarKey(fallbackProfile.profile_avatar_key));
        }
      }
      return;
    }
    if (isLoggedIn && nextUserId === Number(authUser?.id)) {
      await openOwnProfile();
      return;
    }
    setShowProfileModal(true);
    setProfileModalMode("public");
    setProfileModalLoading(true);
    setProfileModalSaving(false);
    setProfileModalError("");
    setProfileModalData(null);
    setProfileDraftAvatarKey(DEFAULT_PROFILE_AVATAR_KEY);
    setProfileAvatarTab("default");
    setProfilePickerOpen(false);
    try {
      const res = await fetch(`${API_BASE}/profiles/${nextUserId}`, { headers: { ...authHeaders } });
      if (res.status === 404) {
        const rewardSnapshot = await ensureHallSnapshotForProfile();
        const ratingSnapshot = await ensureRatingSnapshotForProfile();
        const fallbackProfile = buildPublicProfileFallback(nextUserId, rewardSnapshot, ratingSnapshot, sourceOverride);
        if (!fallbackProfile) {
          throw new Error(L("프로필 정보를 불러오지 못했습니다.", "Failed to load profile."));
        }
        setProfileModalData(fallbackProfile);
        setProfileDraftAvatarKey(normalizeProfileAvatarKey(fallbackProfile.profile_avatar_key));
        return;
      }
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("프로필 정보를 불러오지 못했습니다.", "Failed to load profile."));
      const profile = data.profile || null;
      setProfileModalData(profile);
      setProfileDraftAvatarKey(normalizeProfileAvatarKey(profile?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY));
    } catch (err) {
      const rewardSnapshot = await ensureHallSnapshotForProfile();
      const ratingSnapshot = await ensureRatingSnapshotForProfile();
      const fallbackProfile = buildPublicProfileFallback(nextUserId, rewardSnapshot, ratingSnapshot, sourceOverride);
      if (fallbackProfile) {
        setProfileModalData(fallbackProfile);
        setProfileDraftAvatarKey(normalizeProfileAvatarKey(fallbackProfile.profile_avatar_key));
        setProfileModalError("");
      } else {
        setProfileModalError(String(err.message || L("프로필 정보를 불러오지 못했습니다.", "Failed to load profile.")));
      }
    } finally {
      setProfileModalLoading(false);
    }
  };

  const canOpenUserProfile = (userId) => Number.isInteger(Number(userId)) && Number(userId) > 0;

  const handleOpenUserProfile = (userId, sourceOverride = null) => {
    if (!canOpenUserProfile(userId) && !sourceOverride) return;
    void openPublicProfile(userId, sourceOverride);
  };

  const getDisplayedRaceProfileAvatarKey = (player) => {
    const serverKey = normalizeProfileAvatarKey(player?.profileAvatarKey || DEFAULT_PROFILE_AVATAR_KEY);
    const cachedKey = normalizeProfileAvatarKey(publicProfileAvatarCache[Number(player?.userId || 0)] || "");
    if (serverKey !== DEFAULT_PROFILE_AVATAR_KEY) return serverKey;
    return cachedKey || serverKey;
  };

  const saveProfileAvatarSelection = async () => {
    if (!isLoggedIn || profileModalMode !== "self") return;
    setProfileModalSaving(true);
    setProfileModalError("");
    try {
      const res = await fetch(`${API_BASE}/profile/me`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ profileAvatarKey: profileDraftAvatarKey }),
      });
      if (res.status === 404) {
        throw new Error(L("프로필 저장 실패", "Failed to save profile."));
      }
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("프로필 저장 실패", "Failed to save profile."));
      const nextProfile = data.profile || null;
      if (data.user) {
        writeLocalProfileAvatarOverride(data.user, nextProfile?.profile_avatar_key || profileDraftAvatarKey);
        cacheAuthUser(data.user, { applyPrefs: false });
      }
      setProfileModalData(nextProfile);
      setProfileDraftAvatarKey(normalizeProfileAvatarKey(nextProfile?.profile_avatar_key || profileDraftAvatarKey));
      setRaceState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((player) =>
            Number(player?.userId) === Number(authUser?.id)
              ? { ...player, profileAvatarKey: normalizeProfileAvatarKey(nextProfile?.profile_avatar_key || profileDraftAvatarKey) }
              : player
          ),
        };
      });
      setPvpMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).map((player) =>
            Number(player?.userId) === Number(authUser?.id)
              ? { ...player, profileAvatarKey: normalizeProfileAvatarKey(nextProfile?.profile_avatar_key || profileDraftAvatarKey) }
              : player
          ),
          me:
            prev.me && Number(prev.me.userId) === Number(authUser?.id)
              ? { ...prev.me, profileAvatarKey: normalizeProfileAvatarKey(nextProfile?.profile_avatar_key || profileDraftAvatarKey) }
              : prev.me,
        };
      });
      setStatus(L("프로필이 저장되었습니다.", "Profile saved."));
      closeProfileModal();
    } catch (err) {
      setProfileModalError(String(err?.message || L("프로필 저장 실패", "Failed to save profile.")));
      setStatus(L("프로필 저장에 실패했습니다.", "Failed to save profile."));
    } finally {
      setProfileModalSaving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const modeFromPath = getModeFromPath(window.location.pathname);
      setPlayMode((prev) => (prev === modeFromPath ? prev : modeFromPath));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetPath = getPathFromMode(playMode);
    const currentPath = normalizePath(window.location.pathname);
    if (currentPath === targetPath) return;
    window.history.pushState({ mode: playMode }, "", targetPath);
  }, [playMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isAuthPage = playMode === "auth";
    const existing = document.getElementById(ADSENSE_SCRIPT_ID);

    if (isAuthPage) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const script = document.createElement("script");
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.src = ADSENSE_SRC;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }, [playMode]);

  useEffect(() => {
    const players = Array.isArray(raceState?.players) ? raceState.players : [];
    if (!players.length) return;
    const targetIds = Array.from(
      new Set(
        players
          .map((player) => Number(player?.userId || 0))
          .filter((userId) => Number.isInteger(userId) && userId > 0 && userId !== Number(authUser?.id || 0))
      )
    ).filter((userId) => !publicProfileAvatarCache[userId]);
    if (!targetIds.length) return;

    let cancelled = false;
    void (async () => {
      const nextEntries = await Promise.all(
        targetIds.map(async (userId) => {
          try {
            const res = await fetch(`${API_BASE}/profiles/${userId}`, { headers: { ...authHeaders } });
            if (!res.ok) return null;
            const data = await parseJsonSafe(res);
            const avatarKey = normalizeProfileAvatarKey(data?.profile?.profile_avatar_key || "");
            if (!avatarKey) return null;
            return [userId, avatarKey];
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setPublicProfileAvatarCache((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of nextEntries) {
          if (!entry) continue;
          const [userId, avatarKey] = entry;
          if (next[userId] !== avatarKey) {
            next[userId] = avatarKey;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [raceState?.players, authToken, authUser?.id, publicProfileAvatarCache]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, isDarkMode ? "dark" : "light");
    } catch {
      // ignore localStorage errors
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_VARIANT_KEY, uiStyleVariant);
    } catch {
      // ignore localStorage errors
    }
  }, [uiStyleVariant]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, String(soundVolume));
    } catch {
      // ignore localStorage errors
    }
  }, [soundVolume]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setIsCoarsePointer(Boolean(mq.matches));
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    if (typeof mq.addListener === "function") {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsNarrowViewport(Boolean(mq.matches));
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    if (typeof mq.addListener === "function") {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  useEffect(() => {
    cellValuesRef.current = cells;
  }, [cells]);

  useEffect(() => {
    raceRoomCodeRef.current = raceRoomCode;
    racePlayerIdRef.current = racePlayerId;
  }, [raceRoomCode, racePlayerId]);

  useEffect(() => {
    pvpTicketRef.current = pvpTicketId;
  }, [pvpTicketId]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (racePollRef.current) clearInterval(racePollRef.current);
      if (pvpPollRef.current) clearInterval(pvpPollRef.current);
      if (pvpRevealAnimRef.current) clearInterval(pvpRevealAnimRef.current);
      if (pvpRatingAnimRef.current) cancelAnimationFrame(pvpRatingAnimRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  useEffect(() => {
    const sendLeaveBeacon = () => {
      const roomCode = raceRoomCodeRef.current;
      const playerId = racePlayerIdRef.current;
      const ticketId = pvpTicketRef.current;

      if (roomCode && playerId) {
        const payload = JSON.stringify({ roomCode, playerId });
        try {
          if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon(`${API_BASE}/race/leave`, blob);
          } else {
            fetch(`${API_BASE}/race/leave`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          }
        } catch {
          // ignore beacon errors
        }
      }

      if (ticketId) {
        const payload = JSON.stringify({ ticketId });
        try {
          if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon(`${API_BASE}/pvp/queue/cancel`, blob);
          } else {
            fetch(`${API_BASE}/pvp/queue/cancel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          }
        } catch {
          // ignore beacon errors
        }
      }
    };

    window.addEventListener("pagehide", sendLeaveBeacon);
    window.addEventListener("beforeunload", sendLeaveBeacon);
    return () => {
      window.removeEventListener("pagehide", sendLeaveBeacon);
      window.removeEventListener("beforeunload", sendLeaveBeacon);
    };
  }, []);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { ...authHeaders } });
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok || cancelled) {
          clearAuth();
          return;
        }
        cacheAuthUser(data.user, { applyPrefs: true });
      } catch {
        if (!cancelled) clearAuth();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    const unlock = () => {
      const ctx = ensureAudio();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const rowHints = useMemo(() => {
    if (!Array.isArray(puzzle?.row_hints)) return [];
    return puzzle.row_hints.map((hint) => (Array.isArray(hint) ? hint : []));
  }, [puzzle]);

  const colHints = useMemo(() => {
    if (!Array.isArray(puzzle?.col_hints)) return [];
    return puzzle.col_hints.map((hint) => (Array.isArray(hint) ? hint : []));
  }, [puzzle]);

  const maxRowHintDepth = useMemo(() => {
    if (!rowHints.length) return 0;
    return Math.max(...rowHints.map((h) => h.length), 1);
  }, [rowHints]);

  const maxColHintDepth = useMemo(() => {
    if (!colHints.length) return 0;
    return Math.max(...colHints.map((h) => h.length), 1);
  }, [colHints]);

  const cellSize = useMemo(() => {
    if (!puzzle) return 24;
    return puzzle.width >= 25 ? 20 : 24;
  }, [puzzle]);
  const excelSheetCols = useMemo(() => Array.from({ length: 40 }, (_, idx) => toSheetColumnLabel(idx)), []);
  const excelSheetRows = useMemo(() => Array.from({ length: 120 }, (_, idx) => idx + 1), []);
  const excelBoardCols = useMemo(() => {
    if (!puzzle) return [];
    return Array.from({ length: puzzle.width }, (_, idx) => toSheetColumnLabel(idx));
  }, [puzzle]);
  const excelBoardRows = useMemo(() => {
    if (!puzzle) return [];
    return Array.from({ length: puzzle.height }, (_, idx) => idx + 1);
  }, [puzzle]);

  const solvedRows = useMemo(() => {
    if (!puzzle) return new Set();
    const solved = new Set();
    for (let y = 0; y < puzzle.height; y += 1) {
      const row = deferredCells.slice(y * puzzle.width, (y + 1) * puzzle.width);
      if (cluesEqual(row, rowHints[y] || [])) solved.add(y);
    }
    return solved;
  }, [deferredCells, puzzle, rowHints]);

  const solvedCols = useMemo(() => {
    if (!puzzle) return new Set();
    const solved = new Set();
    for (let x = 0; x < puzzle.width; x += 1) {
      const col = [];
      for (let y = 0; y < puzzle.height; y += 1) col.push(deferredCells[y * puzzle.width + x]);
      if (cluesEqual(col, colHints[x] || [])) solved.add(x);
    }
    return solved;
  }, [deferredCells, puzzle, colHints]);

  const formattedTime = useMemo(() => {
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [elapsedSec]);
  const hallSizes = useMemo(
    () => PVP_SIZE_KEYS.map((sizeKey) => ({ sizeKey, records: Array.isArray(hallDataBySize[sizeKey]) ? hallDataBySize[sizeKey] : [] })),
    [hallDataBySize]
  );
  const hallActiveRecords = useMemo(() => {
    const list = hallDataBySize[hallActiveSizeKey];
    return Array.isArray(list) ? list : [];
  }, [hallDataBySize, hallActiveSizeKey]);

  const isBoardCompleteByHints = useMemo(() => {
    if (!puzzle) return false;
    return solvedRows.size === puzzle.height && solvedCols.size === puzzle.width;
  }, [puzzle, solvedRows, solvedCols]);
  const isModeMenu = playMode === "menu";
  const isModeSingle = playMode === "single";
  const isModeMulti = playMode === "multi";
  const isModePvp = playMode === "pvp";
  const isModePlacementTest = playMode === "placement_test";
  const isModeAuth = playMode === "auth";
  const isModeTutorial = playMode === "tutorial";
  const isModeRanking = playMode === "ranking";
  const isModeLegacyRanking = playMode === "legacy_ranking";
  const isModeReplayHall = playMode === "replay_hall";
  const isLoggedIn = Boolean(authToken && authUser);
  const placementAssignedRating = Number(authUser?.placement_rating || 0);
  const hasPlacementQualification = isLoggedIn && Boolean(authUser?.placement_done) && Number.isFinite(placementAssignedRating) && placementAssignedRating >= 0;
  const placementAssignedTier = hasPlacementQualification
    ? getTierInfoByRating(placementAssignedRating, myRatingRank)
    : null;
  const myTierInfo = isLoggedIn ? getTierInfoByRating(authUser?.rating, myRatingRank) : null;
  const isInRaceRoom = Boolean(raceRoomCode);
  const isSingleSoloMode = (isModeSingle || isModeTutorial || isModePlacementTest) && !isInRaceRoom;
  const shouldShowPuzzleBoard = Boolean(
    puzzle && ((isSingleSoloMode && !isInRaceRoom) || ((isModeMulti || isModePvp) && isInRaceRoom))
  );
  const isMobileBoardUi = shouldShowPuzzleBoard && isCoarsePointer && isNarrowViewport;
  const racePhase = raceState?.state || "idle";
  const isRaceLobby = isInRaceRoom && racePhase === "lobby";
  const isRaceCountdown = isInRaceRoom && racePhase === "countdown";
  const isRacePlaying = isInRaceRoom && racePhase === "playing";
  const isRaceFinished = isInRaceRoom && racePhase === "finished";
  const isRacePreStartMasked = isInRaceRoom && (isRaceLobby || isRaceCountdown);
  const canAutoOpenVoteModal = isLoggedIn
    && playMode !== "auth"
    && !isInRaceRoom
    && !placementRunning
    && !pvpSearching
    && !showNeedLoginPopup
    && !showPlacementRequiredPopup;

  useEffect(() => {
    if (isMobileBoardUi) return;
    setMobileBoardFocus(false);
    setMobileBoardScale(1);
  }, [isMobileBoardUi]);

  useEffect(() => {
    if (typeof document === "undefined" || !mobileBoardFocus) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileBoardFocus]);

  const updateMobileBoardScale = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    setMobileBoardScale(Math.max(0.72, Math.min(1.9, Number(numeric.toFixed(2)))));
  };

  const nudgeMobileBoardScale = (delta) => {
    updateMobileBoardScale(mobileBoardScale + delta);
  };

  useEffect(() => {
    if (!authToken || !authUser?.id) {
      setActiveVote(null);
      setShowVoteModal(false);
      setVoteError("");
      votePromptedTokenRef.current = "";
      return;
    }
    let cancelled = false;
    (async () => {
      const vote = await refreshActiveVote({ autoOpen: true });
      if (cancelled || !vote) return;
      if (!vote.pending) setShowVoteModal(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, authUser?.id, canAutoOpenVoteModal]);
  const racePhaseLabel = useMemo(() => {
    if (racePhase === "lobby") return L("로비", "Lobby");
    if (racePhase === "countdown") return L("카운트다운", "Countdown");
    if (racePhase === "playing") return L("진행 중", "Playing");
    if (racePhase === "finished") return L("경기 종료", "Finished");
    return L("대기 중", "Idle");
  }, [racePhase, lang]);
  const tutorialSolved = isModeTutorial && isBoardCompleteByHints;
  const tutorialStepDone = (step) => {
    if (!step) return false;
    if (step.requireSolved) return tutorialSolved;
    if (!Array.isArray(cells) || !cells.length) return false;
    if (Array.isArray(step.fill) && step.fill.some((idx) => cells[idx] !== 1)) return false;
    if (Array.isArray(step.mark) && step.mark.some((idx) => cells[idx] !== 2)) return false;
    return true;
  };
  const tutorialCurrentTaskIndex = useMemo(() => {
    if (!isModeTutorial) return 0;
    const idx = TUTORIAL_GUIDE_STEPS.findIndex((step) => !tutorialStepDone(step));
    return idx === -1 ? TUTORIAL_GUIDE_STEPS.length : idx;
  }, [isModeTutorial, cells, tutorialSolved]);
  const tutorialCurrentTask = TUTORIAL_GUIDE_STEPS[tutorialCurrentTaskIndex] || null;
  const tutorialAllDone = tutorialCurrentTaskIndex >= TUTORIAL_GUIDE_STEPS.length;
  const tutorialCurrentPrompt = tutorialAllDone
    ? L("완성!", "Complete!")
    : lang === "ko"
      ? tutorialCurrentTask?.prompt
      : tutorialCurrentTask?.promptEn || tutorialCurrentTask?.prompt;
  const tutorialHighlightRows = isModeTutorial && tutorialCurrentTask?.rowHighlights ? tutorialCurrentTask.rowHighlights : [];
  const tutorialHighlightCells =
    isModeTutorial && tutorialCurrentTask?.cellHighlights ? tutorialCurrentTask.cellHighlights : [];

  const myRacePlayer = useMemo(() => {
    if (!raceState || !racePlayerId) return null;
    return raceState.players?.find((p) => p.playerId === racePlayerId) || null;
  }, [raceState, racePlayerId]);
  const isMyRaceFinished = isInRaceRoom && Number.isInteger(myRacePlayer?.elapsedSec);
  const canInteractBoard = !isInRaceRoom || (isRacePlaying && !isMyRaceFinished);

  const raceResultText = useMemo(() => {
    if (!raceState?.winner) return "";
    if (raceState.winner.playerId === racePlayerId) {
      return L("승리하였습니다", "Victory");
    }
    return L("패배하였습니다", "Defeat");
  }, [raceState, racePlayerId, lang]);
  const raceResultKey = useMemo(() => {
    if (!isModeMulti || !isInRaceRoom || !raceRoomCode || !raceState?.gameStartAt) return "";
    return `${raceRoomCode}:${raceState.gameStartAt}`;
  }, [isModeMulti, isInRaceRoom, raceRoomCode, raceState?.gameStartAt]);
  const raceResultRows = useMemo(() => {
    if (!isModeMulti || !raceState) return [];
    const rankings = Array.isArray(raceState.rankings) ? raceState.rankings : [];
    const rankingByPlayerId = new Map(rankings.map((r) => [String(r.playerId || ""), r]));
    const players = Array.isArray(raceState.players) ? raceState.players : [];
    return players
      .map((p) => {
        const rankInfo = rankingByPlayerId.get(String(p.playerId || "")) || null;
        const rank = Number.isInteger(Number(rankInfo?.rank)) ? Number(rankInfo.rank) : null;
        const elapsedSec = Number.isInteger(Number(p.elapsedSec))
          ? Number(p.elapsedSec)
          : Number.isInteger(Number(rankInfo?.elapsedSec))
            ? Number(rankInfo.elapsedSec)
            : null;
        const status = String(rankInfo?.status || (p.disconnectedAt ? "left" : "dnf"));
        return {
          playerId: p.playerId,
          userId: Number.isInteger(Number(p.userId)) ? Number(p.userId) : null,
          nickname: p.nickname,
          rank,
          elapsedSec,
          status,
          isMe: p.playerId === racePlayerId,
        };
      })
      .sort((a, b) => {
        const ar = Number.isInteger(a.rank) ? a.rank : Number.MAX_SAFE_INTEGER;
        const br = Number.isInteger(b.rank) ? b.rank : Number.MAX_SAFE_INTEGER;
        if (ar !== br) return ar - br;
        return String(a.nickname || "").localeCompare(String(b.nickname || ""));
      });
  }, [isModeMulti, raceState, racePlayerId]);
  const roomTitleText = raceState?.roomTitle || "";
  const chatMessages = Array.isArray(raceState?.chatMessages) ? raceState.chatMessages : [];

  const formatRaceElapsedSec = (sec) => {
    if (!Number.isInteger(Number(sec))) return "-";
    const mm = String(Math.floor(Number(sec) / 60)).padStart(2, "0");
    const ss = String(Number(sec) % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const formatRaceElapsedMs = (elapsedMs, fallbackSec = null) => {
    let ms = Number(elapsedMs || 0);
    if (!Number.isFinite(ms) || ms <= 0) {
      const sec = Number(fallbackSec);
      if (!Number.isFinite(sec) || sec <= 0) return "-";
      ms = sec * 1000;
    }
    const totalCs = Math.max(0, Math.floor(ms / 10));
    const mm = String(Math.floor(totalCs / 6000)).padStart(2, "0");
    const ss = String(Math.floor((totalCs % 6000) / 100)).padStart(2, "0");
    const cc = String(totalCs % 100).padStart(2, "0");
    return `${mm}:${ss}.${cc}`;
  };

  const formatHallElapsedMs = (elapsedMs, fallbackSec = null) => {
    let ms = Number(elapsedMs || 0);
    if (!Number.isFinite(ms) || ms <= 0) {
      const sec = Number(fallbackSec);
      if (!Number.isFinite(sec) || sec <= 0) return "-";
      ms = sec * 1000;
    }
    if (ms < 60000) {
      return (ms / 1000).toFixed(2);
    }
    return formatRaceElapsedMs(ms, fallbackSec);
  };

  const formatRaceStatusLabel = (status) => {
    if (status === "finished") return L("완주", "Finished");
    if (status === "timeout") return L("타임아웃", "Timeout");
    if (status === "left") return L("중도 이탈", "Left");
    if (status === "dnf") return L("미완주", "DNF");
    return status || "-";
  };

  const formatKstDate = (ms) => {
    const t = Number(ms || 0);
    if (!Number.isFinite(t) || t <= 0) return "-";
    const kst = new Date(t + 9 * 60 * 60 * 1000);
    const y = String(kst.getUTCFullYear());
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    return `${y}.${m}.${d}`;
  };

  const formatRankLabel = (rank) => {
    const n = Number(rank || 0);
    if (!Number.isInteger(n) || n <= 0) return "-";
    if (lang === "ko") return `${n}위`;
    if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
    if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
    if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
    return `${n}th`;
  };

  const countdownLeft = useMemo(() => {
    if (!isRaceCountdown || !raceState?.gameStartAt) return null;
    const ms = new Date(raceState.gameStartAt).getTime() - nowMs;
    return Math.max(0, Math.ceil(ms / 1000));
  }, [isRaceCountdown, raceState, nowMs]);
  const inactivityTimeoutMs = useMemo(() => {
    const raw = Number(raceState?.inactivityTimeoutMs || 60000);
    if (!Number.isFinite(raw)) return 60000;
    return Math.max(5000, raw);
  }, [raceState?.inactivityTimeoutMs]);
  const inactivityWarnLeadMs = useMemo(() => {
    return 5000;
  }, []);
  const myLastMoveAtMs = useMemo(() => {
    const fromPlayer = Number(myRacePlayer?.lastMoveAt || 0);
    if (Number.isFinite(fromPlayer) && fromPlayer > 0) return fromPlayer;
    const gameStart = Number(new Date(raceState?.gameStartAt || 0).getTime() || 0);
    return gameStart > 0 ? gameStart : 0;
  }, [myRacePlayer?.lastMoveAt, raceState?.gameStartAt]);
  const inactivityLeftMs = useMemo(() => {
    if (!isModePvp || !isRacePlaying || !myRacePlayer || isMyRaceFinished) return 0;
    if (myRacePlayer.disconnectedAt) return 0;
    if (myRacePlayer.loseReason === "inactive_timeout") return 0;
    if (!myLastMoveAtMs) return inactivityTimeoutMs;
    return Math.max(0, inactivityTimeoutMs - (nowMs - myLastMoveAtMs));
  }, [isModePvp, isRacePlaying, myRacePlayer, isMyRaceFinished, myLastMoveAtMs, inactivityTimeoutMs, nowMs]);
  const showInactivityWarning = inactivityLeftMs > 0 && inactivityLeftMs <= inactivityWarnLeadMs;
  const inactivityLeftSec = Math.max(0, Math.ceil(inactivityLeftMs / 1000));
  const inactivityWarnPercent = Math.max(0, Math.min(100, (inactivityLeftMs / inactivityWarnLeadMs) * 100));
  const pvpMatchState = pvpMatch?.state || "";
  const pvpOptions = Array.isArray(pvpMatch?.options) ? pvpMatch.options : [];
  const pvpPlayers = Array.isArray(pvpMatch?.players) ? pvpMatch.players : [];
  const pvpAllowedSizeKeys = useMemo(
    () => getAllowedPvpSizeKeys(pvpPlayers, authUser),
    [
      pvpPlayers,
      authUser?.placement_tier_key,
      authUser?.placement_rating,
      authUser?.rating,
      authUser?.ratingRank,
    ]
  );
  const pvpDisplayOptions = useMemo(() => {
    if (pvpOptions.length > 0) {
      const filteredOptions = pvpOptions.filter((option) => {
        const sizeKey = option?.sizeKey || `${option?.width}x${option?.height}`;
        return pvpAllowedSizeKeys.includes(sizeKey);
      });
      return filteredOptions.length > 0 ? filteredOptions : pvpOptions;
    }
    return pvpAllowedSizeKeys.map((sizeKey) => ({
      sizeKey,
      bannedByNicknames: [],
      banned: false,
    }));
  }, [pvpOptions, pvpAllowedSizeKeys]);
  const pvpAllAccepted = pvpPlayers.length >= 2 && pvpPlayers.every((p) => p.accepted === true);
  const pvpShowdownPlayers = useMemo(() => {
    if (!pvpPlayers.length) return [];
    const myId = Number(authUser?.id || 0);
    const list = [...pvpPlayers];
    list.sort((a, b) => {
      const am = Number(a.userId) === myId ? 0 : 1;
      const bm = Number(b.userId) === myId ? 0 : 1;
      if (am !== bm) return am - bm;
      return Number(a.userId) - Number(b.userId);
    });
    return list.slice(0, 2);
  }, [pvpPlayers, authUser?.id]);
  const isPvpShowdownActive =
    isModePvp &&
    pvpSearching &&
    !isInRaceRoom &&
    pvpShowdownMatchId &&
    pvpShowdownMatchId === String(pvpMatch?.matchId || "") &&
    nowMs < pvpShowdownUntilMs;
  const pvpAcceptLeftMs = useMemo(() => {
    if (pvpMatchState !== "accept") return 0;
    const deadlineAt = Number(pvpMatch?.acceptDeadlineAt || 0);
    if (!deadlineAt) return 0;
    return Math.max(0, deadlineAt - nowMs);
  }, [pvpMatchState, pvpMatch, nowMs]);
  const pvpBanLeftMs = useMemo(() => {
    if (pvpMatchState !== "ban") return 0;
    const deadlineAt = Number(pvpMatch?.banDeadlineAt || 0);
    const banStartAt = Number(pvpMatch?.banStartAt || 0);
    if (!deadlineAt) return 0;
    const effectiveNow = banStartAt > 0 ? Math.max(nowMs, banStartAt) : nowMs;
    return Math.max(0, deadlineAt - effectiveNow);
  }, [pvpMatchState, pvpMatch, nowMs]);
  const pvpAcceptPercent = pvpMatchState === "accept" ? Math.max(0, Math.min(100, (pvpAcceptLeftMs / 12000) * 100)) : 0;
  const pvpBanPercent = pvpMatchState === "ban" ? Math.max(0, Math.min(100, (pvpBanLeftMs / 10000) * 100)) : 0;
  const pvpRevealLeftMs = useMemo(() => {
    if (pvpMatchState !== "reveal") return 0;
    const endAt = Number(pvpMatch?.revealEndAt || 0);
    if (!endAt) return 0;
    return Math.max(0, endAt - nowMs);
  }, [pvpMatchState, pvpMatch, nowMs]);
  const isPvpRevealSpinning =
    pvpMatchState === "reveal" && pvpRevealLeftMs > PVP_REVEAL_RESULT_HOLD_MS;
  const isPvpCancelHomeLocked =
    isModePvp &&
    pvpSearching &&
    (
      pvpMatchState === "ban" ||
      pvpMatchState === "reveal" ||
      (pvpMatchState === "accept" && pvpMatch?.me?.accepted === true)
    );
  const placementElapsedSec = useMemo(() => {
    if (!placementStartedAtMs) return 0;
    if (!placementRunning && placementResultCard?.elapsedSec != null) {
      return Number(placementResultCard.elapsedSec);
    }
    return Math.max(0, Math.min(PLACEMENT_TIME_LIMIT_SEC, Math.floor((nowMs - placementStartedAtMs) / 1000)));
  }, [placementRunning, placementStartedAtMs, placementResultCard?.elapsedSec, nowMs]);
  const placementLeftSec = Math.max(0, PLACEMENT_TIME_LIMIT_SEC - placementElapsedSec);
  const placementStageProgress = useMemo(() => {
    if (!isModePlacementTest || !placementRunning || !puzzle) return 0;
    const totalUnits = Number(puzzle.width || 0) + Number(puzzle.height || 0);
    if (!Number.isFinite(totalUnits) || totalUnits <= 0) return 0;
    const solvedUnits = solvedRows.size + solvedCols.size;
    return Math.max(0, Math.min(1, solvedUnits / totalUnits));
  }, [isModePlacementTest, placementRunning, puzzle, solvedRows, solvedCols]);
  const placementCurrentStage = placementResults[Math.max(0, Math.min(PLACEMENT_STAGES.length - 1, placementStageIndex))] || null;
  const placementTimerText = `${String(Math.floor(placementLeftSec / 60)).padStart(2, "0")}:${String(
    placementLeftSec % 60
  ).padStart(2, "0")}`;
  const matchSimResolvedSec = matchSimFound?.matchedAtSec ?? matchSimElapsedSec;
  const matchSimCurrentRule = useMemo(() => getMatchSimRule(matchSimResolvedSec), [matchSimResolvedSec]);
  const matchSimCurrentTier = useMemo(() => getTierInfoByRating(matchSimRating), [matchSimRating]);
  const matchSimProgressPercent = Math.max(0, Math.min(100, (matchSimResolvedSec / MATCH_SIM_MAX_WAIT_SEC) * 100));
  const matchFlowLeftMs = useMemo(() => {
    if (!matchFlowTest?.phaseEndsAtMs) return 0;
    return Math.max(0, Number(matchFlowTest.phaseEndsAtMs) - nowMs);
  }, [matchFlowTest?.phaseEndsAtMs, nowMs]);
  const matchFlowAcceptPercent =
    matchFlowTest?.phase === "accept" ? Math.max(0, Math.min(100, (matchFlowLeftMs / 3200) * 100)) : 0;
  const matchFlowBanPercent =
    matchFlowTest?.phase === "ban" ? Math.max(0, Math.min(100, (matchFlowLeftMs / 3200) * 100)) : 0;
  const matchFlowShowdownActive = Boolean(matchFlowTest?.showdown);
  const matchFlowRevealSpinning = Boolean(matchFlowTest?.phase === "reveal" && matchFlowTest?.revealSpinning);

  const ensureAudio = () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = SOUND_MASTER_GAIN_MAX * (soundVolume / 100);
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    return ctx;
  };

  useEffect(() => {
    const master = masterGainRef.current;
    if (!master) return;
    master.gain.value = SOUND_MASTER_GAIN_MAX * (soundVolume / 100);
  }, [soundVolume]);

  const authHeaders = useMemo(() => {
    if (!authToken) return {};
    return { Authorization: `Bearer ${authToken}` };
  }, [authToken]);

  const getVoteOptionImageSrc = (option) => {
    const optionKey = String(option?.key || "");
    if (optionKey === "vote-1") return "/votes/vote1.png";
    if (optionKey === "vote-2") return "/votes/vote2.png";
    return String(option?.imagePath || "");
  };

  const refreshActiveVote = async ({ autoOpen = false } = {}) => {
    if (!authToken) {
      setActiveVote(null);
      setShowVoteModal(false);
      setVoteError("");
      return null;
    }
    try {
      const res = await fetch(`${API_BASE}/vote/current`, { headers: { ...authHeaders } });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data?.ok || !data?.vote) {
        throw new Error(data?.error || "vote_load_failed");
      }
      setActiveVote(data.vote);
      setVoteError("");
      if (!data.vote.pending) {
        setShowVoteModal(false);
      } else if (autoOpen && canAutoOpenVoteModal && votePromptedTokenRef.current !== authToken) {
        votePromptedTokenRef.current = authToken;
        setShowVoteModal(true);
      }
      return data.vote;
    } catch (err) {
      setActiveVote(null);
      setVoteError(String(err.message || "Vote load failed"));
      return null;
    }
  };

  const tone = (freq, durMs, { type = "square", gain = 0.1, slideTo = null } = {}) => {
    if (soundVolume <= 0) return;
    const ctx = ensureAudio();
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, ctx.currentTime + durMs / 1000);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);

    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + durMs / 1000 + 0.02);
  };

  const playSfx = (kind) => {
    if (soundVolume <= 0) return;
    if (kind === "ui") {
      tone(620, 50, { type: "triangle", gain: 0.05 });
      return;
    }
    if (kind === "paint-fill") {
      tone(360, 35, { type: "square", gain: 0.04 });
      return;
    }
    if (kind === "paint-x") {
      tone(220, 40, { type: "sawtooth", gain: 0.035, slideTo: 170 });
      return;
    }
    if (kind === "ready") {
      tone(520, 55, { type: "square", gain: 0.06 });
      setTimeout(() => tone(700, 55, { type: "square", gain: 0.05 }), 65);
      return;
    }
    if (kind === "countdown") {
      tone(780, 90, { type: "square", gain: 0.08 });
      return;
    }
    if (kind === "roulette-tick") {
      tone(930, 35, { type: "square", gain: 0.03 });
      return;
    }
    if (kind === "roulette-stop") {
      tone(620, 60, { type: "triangle", gain: 0.06 });
      setTimeout(() => tone(840, 80, { type: "triangle", gain: 0.065 }), 60);
      return;
    }
    if (kind === "rank-up") {
      tone(560, 80, { type: "triangle", gain: 0.075 });
      setTimeout(() => tone(770, 90, { type: "triangle", gain: 0.08 }), 75);
      setTimeout(() => tone(1040, 120, { type: "triangle", gain: 0.085 }), 160);
      return;
    }
    if (kind === "rank-down") {
      tone(560, 90, { type: "sawtooth", gain: 0.06, slideTo: 460 });
      setTimeout(() => tone(430, 110, { type: "sawtooth", gain: 0.055, slideTo: 320 }), 90);
      setTimeout(() => tone(300, 130, { type: "sawtooth", gain: 0.05, slideTo: 220 }), 200);
      return;
    }
    if (kind === "go") {
      tone(560, 70, { type: "square", gain: 0.07 });
      setTimeout(() => tone(780, 80, { type: "square", gain: 0.07 }), 70);
      setTimeout(() => tone(980, 95, { type: "square", gain: 0.075 }), 140);
      return;
    }
    if (kind === "win") {
      tone(700, 120, { type: "triangle", gain: 0.08 });
      setTimeout(() => tone(930, 140, { type: "triangle", gain: 0.08 }), 110);
      setTimeout(() => tone(1240, 180, { type: "triangle", gain: 0.09 }), 230);
      return;
    }
    if (kind === "lose") {
      tone(500, 120, { type: "sawtooth", gain: 0.05, slideTo: 430 });
      setTimeout(() => tone(410, 130, { type: "sawtooth", gain: 0.05, slideTo: 340 }), 120);
      setTimeout(() => tone(330, 150, { type: "sawtooth", gain: 0.045, slideTo: 250 }), 240);
      return;
    }
    if (kind === "clear") {
      tone(280, 80, { type: "triangle", gain: 0.05, slideTo: 200 });
      return;
    }
    tone(500, 60, { type: "triangle", gain: 0.05 });
  };

  useEffect(() => {
    if (!placementResultCard) {
      setPlacementRevealOpen(false);
      setPlacementRevealPhase("idle");
      setPlacementRevealRating(0);
      return;
    }
    const target = Math.max(0, Math.round(Number(placementResultCard.rating || 0)));
    const start = 0;
    const analyzingMs = 980;
    const countMs = 940;
    let analyzingTimer = 0;
    let raf = 0;
    let cancelled = false;

    setPlacementRevealOpen(true);
    setPlacementRevealPhase("analyzing");
    setPlacementRevealRating(start);
    playSfx("ready");

    analyzingTimer = window.setTimeout(() => {
      if (cancelled) return;
      setPlacementRevealPhase("counting");
      playSfx("ui");
      const startTs = performance.now();
      const tick = (ts) => {
        if (cancelled) return;
        const t = Math.max(0, Math.min(1, (ts - startTs) / countMs));
        const eased = 1 - (1 - t) ** 3;
        const now = Math.round(start + (target - start) * eased);
        setPlacementRevealRating(now);
        if (t < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }
        setPlacementRevealPhase("reveal");
        playSfx(target >= 2000 ? "rank-up" : "win");
      };
      raf = requestAnimationFrame(tick);
    }, analyzingMs);

    return () => {
      cancelled = true;
      if (analyzingTimer) window.clearTimeout(analyzingTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [placementResultCard?.rating, placementResultCard?.tier?.key]);

  const markTutorialSeen = () => {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      // ignore localStorage errors
    }
  };

  const startTutorialMode = () => {
    if (isInRaceRoom) {
      setStatus(L("방 대전 중에는 튜토리얼을 시작할 수 없습니다.", "Tutorial is unavailable during a live match."));
      return;
    }
    setStatus("");
    clearPuzzleViewState();
    tutorialCompleteShownRef.current = false;
    setSelectedSize("5x5");
    setPlayMode("tutorial");
    initializePuzzle(TUTORIAL_PUZZLE, {
      resume: false,
      startTimer: true,
      suppressStatus: true,
    });
    playSfx("ui");
  };

  const skipTutorial = async () => {
    markTutorialSeen();
    tutorialCompleteShownRef.current = false;
    await backToMenu();
    playSfx("ui");
  };

  const resetHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  };

  const pushUndo = (snapshot) => {
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const applySnapshot = (nextCells) => {
    setCells(nextCells);
    cellValuesRef.current = nextCells;
  };

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(cellValuesRef.current.slice());
    applySnapshot(prev.slice());
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    playSfx("ui");
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(cellValuesRef.current.slice());
    applySnapshot(next.slice());
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    playSfx("ui");
  };

  const initializePuzzle = (
    p,
    { resume = true, message = "", startTimer = true, suppressStatus = false } = {}
  ) => {
    const saveKey = `nonogram-progress-${p.id}`;
    let initial = new Array(p.width * p.height).fill(0);
    if (resume) {
      const saved = localStorage.getItem(saveKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === initial.length) {
            initial = parsed.map((v) => (v === 1 ? 1 : v === 2 ? 2 : 0));
          }
        } catch {
          // ignore malformed local save
        }
      }
    }
    setPuzzle(p);
    applySnapshot(initial);
    setActiveHints(new Set());
    resetHistory();
    autoSolvedShownRef.current = false;
    raceFinishedSentRef.current = false;
    raceResultShownRef.current = false;
    raceProgressLastSentRef.current = 0;
    setElapsedSec(0);
    setTimerRunning(startTimer);
    setStatus(suppressStatus ? "" : message || `Puzzle ${p.id} loaded.`);
  };

  const fetchRandomPuzzleBySize = async (width, height) => {
    let res = await fetch(`${API_BASE}/puzzles-random?width=${width}&height=${height}`);
    if (res.status === 404) {
      res = await fetch(`${API_BASE}/puzzles/random?width=${width}&height=${height}`);
    }
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.ok || !data.puzzle) {
      throw new Error(data.error || "Failed to load random puzzle.");
    }
    return data.puzzle;
  };

  const loadRandomBySize = async () => {
    if (isInRaceRoom) {
      setStatus("You cannot change puzzle while in a race room.");
      return;
    }
    const [wStr, hStr] = selectedSize.split("x");
    const width = Number(wStr);
    const height = Number(hStr);
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      setStatus("Invalid size selection.");
      return;
    }

    setIsLoading(true);
    setStatus("");
    try {
      const puzzleData = await fetchRandomPuzzleBySize(width, height);
      initializePuzzle(puzzleData, {
        resume: true,
        message: `Puzzle ${puzzleData.id} (${puzzleData.width}x${puzzleData.height}) loaded.`,
      });
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearPuzzleViewState = () => {
    setPuzzle(null);
    applySnapshot([]);
    setActiveHints(new Set());
    resetHistory();
    setElapsedSec(0);
    setTimerRunning(false);
    tutorialCompleteShownRef.current = false;
  };

  const goSingleMode = () => {
    if (pvpSearching && !isInRaceRoom) {
      void cancelPvpQueue({ silent: true });
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    setPlayMode("single");
    setStatus("");
  };

  const openAuthScreen = (tab = "login", returnMode = "menu") => {
    setAuthTab(tab);
    setAuthReturnMode(returnMode);
    setLoginError("");
    setSignupError("");
    setLoginFieldErrors({ username: "", password: "" });
    setSignupFieldErrors({ username: "", nickname: "", password: "", terms: "", privacy: "" });
    setSignupAgreeTerms(false);
    setSignupAgreePrivacy(false);
    setSignupPolicyModal("");
    setStatus("");
    setPlayMode("auth");
  };

  const goMultiMode = () => {
    if (!isLoggedIn) {
      setNeedLoginReturnMode("multi");
      setShowNeedLoginPopup(true);
      return;
    }
    if (pvpSearching && !isInRaceRoom) {
      void cancelPvpQueue({ silent: true });
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    setPlayMode("multi");
    setStatus("");
  };

  const goPvpMode = () => {
    if (!isLoggedIn) {
      setNeedLoginReturnMode("pvp");
      setShowNeedLoginPopup(true);
      return;
    }
    if (!hasPlacementQualification) {
      setShowPlacementRequiredPopup(true);
      setStatus(L("PvP 입장 전 배치고사를 완료해야 합니다.", "You must complete placement before entering PvP."));
      return;
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    setPlayMode("pvp");
    setStatus("");
  };

  const goRankingMode = () => {
    if (pvpSearching && !isInRaceRoom) {
      void cancelPvpQueue({ silent: true });
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    setPlayMode("ranking");
    setStatus("");
  };

  const goReplayHallMode = () => {
    if (pvpSearching && !isInRaceRoom) {
      void cancelPvpQueue({ silent: true });
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    setHallActiveSizeKey("10x10");
    setPlayMode("replay_hall");
    setStatus("");
  };

  const clearMatchSimState = () => {
    matchSimSessionRef.current += 1;
    matchSimElapsedRef.current = 0;
    matchSimLastRuleKeyRef.current = "";
    setMatchSimSearching(false);
    setMatchSimElapsedSec(0);
    setMatchSimQueueSize(getMatchSimQueueSize(0, matchSimRating));
    setMatchSimLogs([]);
    setMatchSimFound(null);
  };

  const resetPlacementTest = () => {
    placementSessionRef.current += 1;
    clearMatchSimState();
    resetMatchFlowTest();
    clearPuzzleViewState();
    setPlacementRunning(false);
    setPlacementLoading(false);
    setPlacementRevealOpen(false);
    setPlacementRevealPhase("idle");
    setPlacementRevealRating(0);
    setPlacementStartedAtMs(0);
    setPlacementStageIndex(0);
    setPlacementResults(PLACEMENT_STAGES.map((s) => ({ ...s, status: "pending", solvedAtSec: null })));
    setPlacementResultCard(null);
  };

  const goPlacementTestMode = () => {
    if (!isLoggedIn) {
      setNeedLoginReturnMode("placement_test");
      setShowNeedLoginPopup(true);
      return;
    }
    if (pvpSearching && !isInRaceRoom) {
      void cancelPvpQueue({ silent: true });
    }
    if (!isInRaceRoom) clearPuzzleViewState();
    resetPlacementTest();
    setPlayMode("placement_test");
    setStatus("");
  };

  const applyPlacementResultToCurrentUser = async (results, elapsedSec, currentStageProgress, fallbackEvaluated = null) => {
    if (!isLoggedIn || !authUser) {
      throw new Error(L("배치고사는 로그인 후 저장됩니다.", "Login is required to save placement."));
    }
    const res = await fetch(`${API_BASE}/placement/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        results,
        elapsedSec,
        currentStageProgress,
      }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.ok) {
      throw new Error(data.error || L("배치고사 저장 실패", "Failed to save placement result"));
    }
    if (data.user) {
      cacheAuthUser(data.user, { applyPrefs: false });
    }
    if (data.placement) {
      const rating = Number(data.placement.rating || fallbackEvaluated?.rating || 0);
      return {
        rating,
        tier: getTierInfoByRating(rating),
        solvedSequential: Number(data.placement.solvedSequential || fallbackEvaluated?.solvedSequential || 0),
        elapsedSec: Number(data.placement.elapsedSec || fallbackEvaluated?.elapsedSec || 0),
        completedAtMs: Number(data.placement.completedAtMs || Date.now()),
      };
    }
    return fallbackEvaluated;
  };

  const finishPlacementTest = async (fromTimeout = false, overrideResults = null, stageProgressOverride = null) => {
    placementSessionRef.current += 1;
    const elapsed = placementStartedAtMs
      ? Math.max(0, Math.min(PLACEMENT_TIME_LIMIT_SEC, Math.floor((Date.now() - placementStartedAtMs) / 1000)))
      : placementElapsedSec;
    let finalResults = Array.isArray(overrideResults)
      ? overrideResults.map((row) => ({ ...row }))
      : placementResults.map((row) => ({ ...row }));
    if (fromTimeout && placementRunning && finalResults.length > 0) {
      const idx = Math.max(0, Math.min(finalResults.length - 1, placementStageIndex));
      if (finalResults[idx]?.status === "pending") {
        finalResults[idx] = {
          ...finalResults[idx],
          status: "failed",
          solvedAtSec: null,
        };
      }
    }
    const stageProgress = Number.isFinite(Number(stageProgressOverride))
      ? Number(stageProgressOverride)
      : placementStageProgress;
    const evaluated = evaluatePlacementResult(finalResults, elapsed, stageProgress);
    setPlacementRunning(false);
    setPlacementLoading(false);
    setTimerRunning(false);
    setPlacementResults(finalResults);
    try {
      const assigned = await applyPlacementResultToCurrentUser(finalResults, elapsed, stageProgress, evaluated);
      const resolved = assigned || evaluated;
      setPlacementResultCard(resolved);
      setStatus(
        L(
          `배치고사 완료. 초기 레이팅 R ${resolved.rating}이 계정에 반영되었습니다.`,
          `Placement complete. Initial rating R ${resolved.rating} has been assigned to your account.`
        )
      );
    } catch (err) {
      setPlacementResultCard(evaluated);
      setStatus(
        err.message
          || (fromTimeout
            ? L("시간 종료! 배치고사 결과 저장에 실패했습니다.", "Time over! Failed to save placement result.")
            : L("배치고사 결과 저장에 실패했습니다.", "Failed to save placement result."))
      );
    }
  };

  const loadPlacementStage = async (stageIdx, sessionId = placementSessionRef.current) => {
    const stage = PLACEMENT_STAGES[stageIdx];
    if (!stage) return;
    const [wStr, hStr] = String(stage.sizeKey || "").split("x");
    const width = Number(wStr);
    const height = Number(hStr);
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error("Invalid placement stage size.");
    }
    setPlacementLoading(true);
    try {
      const stagePuzzle = await fetchRandomPuzzleBySize(width, height);
      if (placementSessionRef.current !== sessionId || playMode !== "placement_test") return;
      initializePuzzle(stagePuzzle, {
        resume: false,
        message: "",
        startTimer: false,
        suppressStatus: true,
      });
      setStatus(
        L(
          `${stageIdx + 1}단계 진행 중 (${stage.sizeKey})`,
          `Stage ${stageIdx + 1} in progress (${stage.sizeKey})`
        )
      );
    } finally {
      if (placementSessionRef.current === sessionId) {
        setPlacementLoading(false);
      }
    }
  };

  const startPlacementTest = async () => {
    if (!isLoggedIn) {
      setNeedLoginReturnMode("placement_test");
      setShowNeedLoginPopup(true);
      return;
    }
    if (hasPlacementQualification) {
      setStatus(L("배치고사가 이미 완료되었습니다.", "Placement has already been completed."));
      return;
    }
    const sessionId = Date.now();
    placementSessionRef.current = sessionId;
    clearMatchSimState();
    resetMatchFlowTest();
    setPlacementRunning(true);
    setPlacementLoading(true);
    setPlacementStartedAtMs(Date.now());
    setPlacementStageIndex(0);
    setPlacementResultCard(null);
    setPlacementResults(PLACEMENT_STAGES.map((s) => ({ ...s, status: "pending", solvedAtSec: null })));
    setStatus(L("배치고사 시작! 1단계 퍼즐 로딩 중...", "Placement started! Loading stage 1..."));
    try {
      await loadPlacementStage(0, sessionId);
      playSfx("ui");
    } catch (err) {
      if (placementSessionRef.current !== sessionId) return;
      setStatus(err.message || "Failed to start placement test.");
      void finishPlacementTest(false);
    }
  };

  const runPlacementRevealTest = (tierKey = "") => {
    const preset = PLACEMENT_REVEAL_TEST_PRESETS.find((p) => p.key === tierKey) || null;
    const randomRating = 1950 + Math.floor(Math.random() * 420);
    const rating = preset ? Number(preset.rating) : randomRating;
    const boundedRating = Math.max(0, Math.min(5000, rating));
    const tier = getTierInfoByRating(boundedRating);
    const solvedSequential = preset
      ? Number(preset.solvedSequential || 3)
      : boundedRating >= 2000
        ? 4
        : 3;
    const elapsedSec = preset ? Number(preset.elapsedSec || 238) : 238;
    setPlacementRunning(false);
    setPlacementLoading(false);
    setPlacementRevealOpen(false);
    setPlacementRevealPhase("idle");
    setPlacementRevealRating(0);
    setPlacementResultCard({
      rating: boundedRating,
      tier,
      solvedSequential,
      elapsedSec,
    });
    setStatus(
      preset
        ? L(`${tier.labelKo} 연출 테스트 실행`, `${tier.labelEn} reveal test started`)
        : L("연출 테스트 실행", "Reveal animation test started")
    );
    playSfx("ui");
  };

  const handlePlacementStageSolved = async () => {
    if (!placementRunning) return;
    const sessionId = placementSessionRef.current;
    const idx = Math.max(0, Math.min(PLACEMENT_STAGES.length - 1, placementStageIndex));
    const solvedAtSec = placementElapsedSec;
    let nextResults = placementResults;
    setPlacementResults((prev) => {
      nextResults = prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              status: "solved",
              solvedAtSec,
            }
          : row
      );
      return nextResults;
    });
    if (idx >= PLACEMENT_STAGES.length - 1) {
      setPlacementStageIndex(idx);
      void finishPlacementTest(false, nextResults, 0);
      return;
    }
    const nextIdx = idx + 1;
    setPlacementStageIndex(nextIdx);
    setStatus(L(`${idx + 1}단계 완료! 다음 퍼즐 로딩 중...`, `Stage ${idx + 1} cleared! Loading next puzzle...`));
    try {
      await loadPlacementStage(nextIdx, sessionId);
      playSfx("ui");
    } catch (err) {
      if (placementSessionRef.current !== sessionId) return;
      let failResults = nextResults;
      setPlacementResults((prev) => {
        failResults = prev.map((row, i) =>
          i === nextIdx && row.status === "pending"
            ? {
                ...row,
                status: "failed",
                solvedAtSec: null,
              }
            : row
        );
        return failResults;
      });
      setStatus(err.message || "Failed to load next stage.");
      void finishPlacementTest(false, failResults, 0);
    }
  };

  const backToMenu = async () => {
    if (isInRaceRoom) {
      setStatus(L("진행 중인 경기에서는 먼저 Leave를 눌러줘.", "Leave the current match first."));
      return;
    }
    if (pvpSearching) {
      await cancelPvpQueue({ silent: true });
    }
    clearPuzzleViewState();
    setPlayMode("menu");
    setStatus("");
  };

  const storeAuth = (token, user) => {
    setAuthToken(token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    cacheAuthUser(user, { applyPrefs: true });
  };

  const routeAfterAuth = (user, returnMode = "menu") => {
    const placementRating = Number(user?.placement_rating || 0);
    const canEnterPvp = Boolean(user?.placement_done) && Number.isFinite(placementRating) && placementRating >= 0;
    if (returnMode === "multi") {
      setPlayMode("multi");
      return;
    }
    if (returnMode === "placement_test") {
      setPlayMode("placement_test");
      return;
    }
    if (returnMode === "pvp") {
      if (canEnterPvp) {
        setPlayMode("pvp");
      } else {
        setPlayMode("menu");
        setShowPlacementRequiredPopup(true);
        setStatus(L("PvP 입장 전 배치고사를 완료해야 합니다.", "You must complete placement before entering PvP."));
      }
      return;
    }
    setPlayMode("menu");
  };

  const clearAuth = () => {
    setAuthToken("");
    setAuthUser(null);
    setActiveVote(null);
    setShowVoteModal(false);
    setVoteError("");
    votePromptedTokenRef.current = "";
    closeProfileModal();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  };

  const signup = async () => {
    const username = signupUsername.trim().toLowerCase();
    const nickname = signupNickname.trim();
    const password = signupPassword;
    const fieldErrors = { username: "", nickname: "", password: "", terms: "", privacy: "" };
    if (!username || !nickname || !password) {
      setSignupError(L("아이디, 닉네임, 비밀번호를 모두 입력해줘.", "Please fill in username, nickname, and password."));
      if (!username) fieldErrors.username = L("아이디를 입력해줘.", "Enter your username.");
      if (!nickname) fieldErrors.nickname = L("닉네임을 입력해줘.", "Enter your nickname.");
      if (!password) fieldErrors.password = L("비밀번호를 입력해줘.", "Enter your password.");
      setSignupFieldErrors(fieldErrors);
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || password.length < 8) {
      fieldErrors.password = L("영문+숫자 포함 8자 이상", "At least 8 chars with letters and numbers");
      setSignupFieldErrors(fieldErrors);
      return;
    }
    if (!signupAgreeTerms || !signupAgreePrivacy) {
      if (!signupAgreeTerms) {
        fieldErrors.terms = L("이용약관 동의가 필요합니다.", "You must agree to the Terms of Service.");
      }
      if (!signupAgreePrivacy) {
        fieldErrors.privacy = L("개인정보처리방침 동의가 필요합니다.", "You must agree to the Privacy Policy.");
      }
      setSignupFieldErrors(fieldErrors);
      setSignupError(L("필수 약관 동의가 필요합니다.", "Required agreements are missing."));
      return;
    }
    setSignupError("");
    setSignupFieldErrors({ username: "", nickname: "", password: "", terms: "", privacy: "" });
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, nickname, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("회원가입 실패", "Sign-up failed"));
      storeAuth(data.token, data.user);
      setSignupUsername("");
      setSignupNickname("");
      setSignupPassword("");
      setSignupAgreeTerms(false);
      setSignupAgreePrivacy(false);
      setStatus(L(`환영합니다, ${data.user.nickname}!`, `Welcome, ${data.user.nickname}!`));
      routeAfterAuth(data.user, authReturnMode);
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("password must be 8+ chars")) {
        setSignupFieldErrors((prev) => ({ ...prev, password: L("영문+숫자 포함 8자 이상", "At least 8 chars with letters and numbers") }));
      } else if (msg.includes("username must be 3-24 chars")) {
        setSignupFieldErrors((prev) => ({ ...prev, username: L("아이디는 3~24자", "Username must be 3-24 chars") }));
      } else {
        setSignupError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    const username = loginUsername.trim().toLowerCase();
    const password = loginPassword;
    const fieldErrors = { username: "", password: "" };
    if (!username || !password) {
      setLoginError(L("아이디와 비밀번호를 입력해줘.", "Please enter username and password."));
      if (!username) fieldErrors.username = L("아이디를 입력해줘.", "Enter your username.");
      if (!password) fieldErrors.password = L("비밀번호를 입력해줘.", "Enter your password.");
      setLoginFieldErrors(fieldErrors);
      return;
    }
    setLoginFieldErrors({ username: "", password: "" });
    setLoginError("");
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("로그인 실패", "Login failed"));
      storeAuth(data.token, data.user);
      setLoginUsername("");
      setLoginPassword("");
      setStatus(L(`로그인 완료: ${data.user.nickname}`, `Logged in: ${data.user.nickname}`));
      routeAfterAuth(data.user, authReturnMode);
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("Invalid credentials")) {
        setLoginError(L("아이디 또는 비밀번호가 올바르지 않습니다.", "Invalid username or password."));
      } else {
        setLoginError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (authToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: { ...authHeaders },
        });
      }
    } catch {
      // ignore logout api errors
    }
    await leaveRace();
    clearAuth();
    setStatus(L("로그아웃 되었습니다.", "Logged out."));
  };

  const submitVote = async (optionKey) => {
    if (!authToken || voteSubmitting) return;
    setVoteSubmitting(true);
    setVoteError("");
    try {
      const res = await fetch(`${API_BASE}/vote/current`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ optionKey }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data?.ok || !data?.vote) {
        throw new Error(data?.error || L("투표 저장 실패", "Vote submission failed"));
      }
      setActiveVote(data.vote);
      setShowVoteModal(false);
      setStatus(L("투표가 반영되었습니다.", "Your vote has been recorded."));
    } catch (err) {
      setVoteError(String(err.message || L("투표 저장 실패", "Vote submission failed")));
    } finally {
      setVoteSubmitting(false);
    }
  };

  const fetchPublicRooms = async () => {
    if (isInRaceRoom) return;
    setRoomsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race-rooms`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load room list.");
      setPublicRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setRoomsLoading(false);
    }
  };

  const fetchRatingUsers = async (view = "current") => {
    setRatingLoading(true);
    try {
      const q = view === "legacy" ? "?limit=200&view=legacy" : "?limit=200";
      const res = await fetch(`${API_BASE}/ratings/leaderboard${q}`, {
        headers: { ...authHeaders },
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("랭킹 조회 실패", "Failed to load ranking"));
      setRatingUsers(Array.isArray(data.users) ? data.users : []);
      setMyRatingRank(Number.isInteger(Number(data.myRank)) ? Number(data.myRank) : null);
      setRatingTotalUsers(Number.isInteger(Number(data.totalUsers)) ? Number(data.totalUsers) : 0);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setRatingLoading(false);
    }
  };

  const fetchBestReplayRecords = async () => {
    setReplayLoading(true);
    setReplayError("");
    try {
      const res = await fetch(`${API_BASE}/replays/hall`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("명예의 전당 조회 실패", "Failed to load Hall of Fame records"));
      const sizes = Array.isArray(data.sizes) ? data.sizes : [];
      const mapped = {};
      for (const key of PVP_SIZE_KEYS) mapped[key] = [];
      for (const bucket of sizes) {
        const sizeKey = String(bucket?.sizeKey || "");
        if (!sizeKey || !mapped[sizeKey]) continue;
        const top = Array.isArray(bucket?.top) ? bucket.top : [];
        mapped[sizeKey] = top.slice(0, 3).map((r, idx) => ({
          recordId: Number(r.recordId),
          rank: Number(r.rank || idx + 1),
          userId: Number(r.userId),
          nickname: String(r.nickname || ""),
          elapsedSec: Number(r.elapsedSec || 0),
          elapsedMs: Number(r.elapsedMs || 0),
          puzzleId: Number(r.puzzleId),
          finishedAtMs: Number(r.finishedAtMs || 0),
          sizeKey,
        }));
      }
      const streakTopRaw = Array.isArray(data?.streakTop) ? data.streakTop : [];
      const streakTop = streakTopRaw
        .map((r, idx) => ({
          rank: Number(r.rank || idx + 1),
          userId: Number(r.userId || 0),
          nickname: String(r.nickname || ""),
          winStreakBest: Number(r.winStreakBest || 0),
        }))
        .filter((r) => r.winStreakBest > 0)
        .slice(0, 3);
      setHallDataBySize(mapped);
      setHallStreakTop(streakTop);
      const fallbackSize = PVP_SIZE_KEYS.includes(hallActiveSizeKey)
        ? hallActiveSizeKey
        : PVP_SIZE_KEYS[0];
      setHallActiveSizeKey(fallbackSize);
    } catch (err) {
      setReplayError(err.message);
      setStatus(err.message);
      setHallDataBySize({});
      setHallStreakTop([]);
    } finally {
      setReplayLoading(false);
    }
  };

  const stopPvpPolling = () => {
    if (pvpPollRef.current) {
      clearInterval(pvpPollRef.current);
      pvpPollRef.current = 0;
    }
  };

  const stopPvpRevealAnimation = () => {
    if (pvpRevealAnimRef.current) {
      clearInterval(pvpRevealAnimRef.current);
      pvpRevealAnimRef.current = 0;
    }
  };

  const stopPvpRatingAnimation = () => {
    if (pvpRatingAnimRef.current) {
      cancelAnimationFrame(pvpRatingAnimRef.current);
      pvpRatingAnimRef.current = 0;
    }
  };

  const dismissPvpRatingFx = () => {
    stopPvpRatingAnimation();
    setPvpRatingFx(null);
  };

  const startPvpRatingAnimation = (fromRating, toRating, roomCode, options = {}) => {
    stopPvpRatingAnimation();
    const from = Number(fromRating);
    const to = Number(toRating);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const delta = to - from;
    const result = options.result === "loss" ? "loss" : "win";
    const fromRank = Number.isFinite(Number(options.fromRank)) ? Number(options.fromRank) : null;
    const toRank = Number.isFinite(Number(options.toRank)) ? Number(options.toRank) : null;
    const fromTier = getTierBracketInfo(from, fromRank).tier;
    const toTier = getTierBracketInfo(to, toRank).tier;
    const tierShift =
      (TIER_ORDER[toTier.key] || 0) > (TIER_ORDER[fromTier.key] || 0)
        ? "promoted"
        : (TIER_ORDER[toTier.key] || 0) < (TIER_ORDER[fromTier.key] || 0)
          ? "demoted"
          : "steady";
    const duration = 1850;
    const startAt = performance.now();

    setPvpRatingFx({
      roomCode,
      from,
      to,
      delta,
      ratingNow: from,
      deltaNow: 0,
      result,
      fromRank,
      toRank,
      fromTier,
      toTier,
      tierShift,
      isTest: Boolean(options.isTest),
      done: false,
    });
    playSfx(result === "win" ? "win" : "rank-down");

    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - startAt) / duration));
      const eased = 1 - (1 - t) ** 3;
      const ratingNow = Math.round(from + (to - from) * eased);
      const deltaNow = Math.round(delta * eased);
      setPvpRatingFx((prev) =>
        prev
          ? {
              ...prev,
              ratingNow,
              deltaNow,
              done: t >= 1,
            }
          : prev
      );

      if (t < 1) {
        pvpRatingAnimRef.current = requestAnimationFrame(tick);
      } else {
        pvpRatingAnimRef.current = 0;
        playSfx(tierShift === "promoted" || delta >= 0 ? "rank-up" : "rank-down");
      }
    };

    pvpRatingAnimRef.current = requestAnimationFrame(tick);
  };

  const runPvpResultFxTest = (presetKey) => {
    const preset = PVP_RESULT_FX_TEST_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    startPvpRatingAnimation(preset.from, preset.to, `pvp-fx-test:${preset.key}:${Date.now()}`, {
      result: preset.outcome,
      isTest: true,
    });
  };

  const pushMatchSimLog = (textKo, textEn, tone = "neutral") => {
    setMatchSimLogs((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, textKo, textEn, tone }];
      return next.slice(-8);
    });
  };

  const resetMatchSim = ({ clearFx = false, keepProfile = true } = {}) => {
    clearMatchSimState();
    if (!keepProfile) {
      const preset = MATCH_SIM_PROFILE_PRESETS.find((item) => item.key === "gold");
      setMatchSimProfileKey("gold");
      setMatchSimRating(preset?.rating || 1760);
    }
    if (clearFx) dismissPvpRatingFx();
  };

  const selectMatchSimProfile = (profileKey) => {
    const preset = MATCH_SIM_PROFILE_PRESETS.find((item) => item.key === profileKey);
    if (!preset) return;
    clearMatchSimState();
    setMatchSimProfileKey(profileKey);
    setMatchSimRating(preset.rating);
    setMatchSimQueueSize(getMatchSimQueueSize(0, preset.rating));
  };

  const startMatchSim = () => {
    const tier = getTierInfoByRating(matchSimRating);
    const firstRule = getMatchSimRule(0);
    clearMatchSimState();
    matchSimLastRuleKeyRef.current = firstRule.key;
    setMatchSimSearching(true);
    setMatchSimQueueSize(getMatchSimQueueSize(0, matchSimRating));
    pushMatchSimLog(
      `${tier.labelKo} 구간 R ${matchSimRating} 기준으로 탐색 시작`,
      `Starting search around ${tier.labelEn} at R ${matchSimRating}`,
      "info"
    );
    pushMatchSimLog(
      `1단계 규칙 적용: ${firstRule.labelKo}`,
      `Stage 1 rule: ${firstRule.labelEn}`,
      "info"
    );
    playSfx("ui");
  };

  const runMatchSimResultFx = (mode) => {
    const outcome = getMatchSimOutcomeTarget(matchSimRating, mode);
    startPvpRatingAnimation(matchSimRating, outcome.to, `match-sim:${mode}:${Date.now()}`, {
      result: outcome.result,
      isTest: true,
    });
    pushMatchSimLog(
      mode === "promotion"
        ? "승급 결과 연출 실행"
        : mode === "demotion"
          ? "강등 결과 연출 실행"
          : mode === "loss"
            ? "패배 결과 연출 실행"
            : "승리 결과 연출 실행",
      mode === "promotion"
        ? "Promotion result FX triggered"
        : mode === "demotion"
          ? "Demotion result FX triggered"
          : mode === "loss"
            ? "Defeat result FX triggered"
            : "Victory result FX triggered",
      "accent"
    );
  };

  const clearMatchFlowTimers = () => {
    if (matchFlowRevealRef.current) {
      clearInterval(matchFlowRevealRef.current);
      matchFlowRevealRef.current = 0;
    }
    if (matchFlowTimersRef.current.length) {
      matchFlowTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      matchFlowTimersRef.current = [];
    }
  };

  const resetMatchFlowTest = ({ clearFx = false } = {}) => {
    clearMatchFlowTimers();
    setMatchFlowTest(null);
    if (clearFx) dismissPvpRatingFx();
  };

  const startMatchFlowTest = (outcome = "win") => {
    clearMatchFlowTimers();
    dismissPvpRatingFx();
    const myNickname = authUser?.nickname || L("테스터", "Tester");
    const scriptedOptions = PVP_SIZE_KEYS.map((sizeKey) => ({
      sizeKey,
      bannedByNicknames: [],
      banned: false,
    }));
    const chosenSizeKey = "10x10";
    const roomCode = `flow-test:${outcome}:${Date.now()}`;

    setMatchFlowTest({
      active: true,
      outcome,
      phase: "search",
      queueSize: 4,
      meAccepted: false,
      opponentAccepted: false,
      showdown: false,
      revealIndex: 0,
      revealSpinning: false,
      chosenSizeKey,
      options: scriptedOptions,
      phaseEndsAtMs: Date.now() + 2200,
      roomCode,
      me: {
        nickname: myNickname,
        rating: MATCH_FLOW_TEST_BASE_RATING,
        ratingRank: null,
      },
      opponent: MATCH_FLOW_TEST_OPPONENT,
    });
    setStatus(L("풀 시퀀스 테스트 시작", "Full flow test started"));
    playSfx("ui");

    const schedule = (delay, callback) => {
      const timerId = setTimeout(callback, delay);
      matchFlowTimersRef.current.push(timerId);
    };

    schedule(650, () => {
      setMatchFlowTest((prev) => (prev ? { ...prev, queueSize: 3 } : prev));
    });
    schedule(1450, () => {
      setMatchFlowTest((prev) => (prev ? { ...prev, queueSize: 2 } : prev));
    });
    schedule(2200, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              phase: "accept",
              phaseEndsAtMs: Date.now() + 3200,
              meAccepted: false,
              opponentAccepted: false,
            }
          : prev
      );
      playSfx("ready");
    });
    schedule(3300, () => {
      setMatchFlowTest((prev) => (prev ? { ...prev, meAccepted: true } : prev));
      playSfx("ui");
    });
    schedule(4300, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              meAccepted: true,
              opponentAccepted: true,
              showdown: true,
              phaseEndsAtMs: Date.now() + 1700,
            }
          : prev
      );
      playSfx("countdown");
    });
    schedule(6000, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              phase: "ban",
              showdown: false,
              phaseEndsAtMs: Date.now() + 3200,
              options: scriptedOptions,
            }
          : prev
      );
      playSfx("ui");
    });
    schedule(7050, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              options: prev.options.map((option) =>
                option.sizeKey === "25x25"
                  ? { ...option, bannedByNicknames: [prev.opponent.nickname], banned: true }
                  : option
              ),
            }
          : prev
      );
    });
    schedule(8350, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              options: prev.options.map((option) =>
                option.sizeKey === "20x20"
                  ? { ...option, bannedByNicknames: [prev.me.nickname], banned: true }
                  : option
              ),
            }
          : prev
      );
    });
    schedule(9400, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              phase: "reveal",
              revealIndex: 0,
              revealSpinning: true,
              phaseEndsAtMs: Date.now() + 4200,
            }
          : prev
      );
      let revealIdx = 0;
      if (matchFlowRevealRef.current) clearInterval(matchFlowRevealRef.current);
      matchFlowRevealRef.current = window.setInterval(() => {
        revealIdx = (revealIdx + 1) % PVP_SIZE_KEYS.length;
        setMatchFlowTest((prev) => (prev ? { ...prev, revealIndex: revealIdx } : prev));
        playSfx("roulette-tick");
      }, 150);
    });
    schedule(12600, () => {
      if (matchFlowRevealRef.current) {
        clearInterval(matchFlowRevealRef.current);
        matchFlowRevealRef.current = 0;
      }
      const finalIndex = PVP_SIZE_KEYS.indexOf(chosenSizeKey);
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              revealIndex: finalIndex >= 0 ? finalIndex : 0,
              revealSpinning: false,
            }
          : prev
      );
      playSfx("roulette-stop");
    });
    schedule(14500, () => {
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              phase: "game",
              phaseEndsAtMs: Date.now() + 1800,
            }
          : prev
      );
      playSfx("countdown");
    });
    schedule(16500, () => {
      const result = outcome === "loss" ? "loss" : "win";
      const toRating = result === "loss" ? 563 : 621;
      startPvpRatingAnimation(MATCH_FLOW_TEST_BASE_RATING, toRating, roomCode, {
        result,
        isTest: true,
      });
      setMatchFlowTest((prev) =>
        prev
          ? {
              ...prev,
              phase: "done",
              active: false,
              phaseEndsAtMs: 0,
            }
          : prev
      );
    });
  };

  const pvpCancelReasonText = (reason) => {
    if (reason === "accept_timeout") return L("매칭 수락 시간이 지나 자동 취소되었습니다.", "Match cancelled: accept timeout.");
    if (reason === "cancelled_by_user") return L("상대가 수락을 취소해 매칭이 종료되었습니다.", "Match cancelled: opponent declined.");
    if (reason === "no_puzzle_for_selected_size") return L("선택 가능한 퍼즐이 없어 매칭이 취소되었습니다.", "Match cancelled: no puzzle available.");
    if (reason === "puzzle_solution_missing") return L("퍼즐 데이터 오류로 매칭이 취소되었습니다.", "Match cancelled: puzzle data error.");
    if (reason === "invalid_selected_size") return L("매칭 설정 오류로 매칭이 취소되었습니다.", "Match cancelled: invalid match settings.");
    return L("매칭이 취소되었습니다.", "Match cancelled.");
  };

  const resetPvpQueueState = () => {
    stopPvpPolling();
    stopPvpRevealAnimation();
    stopPvpRatingAnimation();
    setPvpSearching(false);
    setPvpTicketId("");
    setPvpQueueSize(0);
    setPvpServerState("idle");
    setPvpMatch(null);
    setPvpAcceptBusy(false);
    setPvpBanBusy(false);
    setPvpRevealIndex(0);
    setPvpRatingFx(null);
    setPvpShowdownMatchId("");
    setPvpShowdownUntilMs(0);
    pvpMatchPhaseRef.current = "";
    pvpRatingBaseRef.current = null;
    pvpRatingBaseGamesRef.current = null;
    pvpRatingFxDoneRoomRef.current = "";
    pvpAuthRefreshDoneRoomRef.current = "";
    pvpShowdownSeenRef.current = "";
  };

  const applyPvpMatch = (data) => {
    stopPvpPolling();
    stopPvpRevealAnimation();
    stopPvpRatingAnimation();
    setPvpSearching(false);
    setPvpQueueSize(0);
    setPvpServerState("ready");
    setPvpMatch(null);
    setPvpAcceptBusy(false);
    setPvpBanBusy(false);
    setPvpRevealIndex(0);
    setPvpRatingFx(null);
    setPvpShowdownMatchId("");
    setPvpShowdownUntilMs(0);
    pvpMatchPhaseRef.current = "";
    pvpRatingBaseRef.current = Number(authUser?.rating ?? 1500);
    pvpRatingBaseGamesRef.current = Number(authUser?.rating_games ?? 0);
    pvpRatingFxDoneRoomRef.current = "";
    pvpAuthRefreshDoneRoomRef.current = "";
    pvpShowdownSeenRef.current = "";
    if (data.ticketId) setPvpTicketId(data.ticketId);
    setRaceRoomCode(data.roomCode);
    setRacePlayerId(data.playerId);
    applyRaceRoomState(data.room, data.playerId);
    initializePuzzle(data.puzzle, {
      resume: false,
      startTimer: false,
      message: L("5초 카운트다운 후 시작됩니다.", "Starting after a 5-second countdown."),
    });
    setPlayMode("pvp");
    startRacePolling(data.roomCode, data.playerId);
    playSfx("ui");
  };

  const applyPvpStatusPayload = (data) => {
    const state = String(data?.state || (data?.matched ? "ready" : "waiting"));
    const queueSize = Number(data?.queueSize || 0);
    const match = data?.match || null;

    if (data?.ticketId) setPvpTicketId(String(data.ticketId));
    setPvpServerState(state);
    setPvpQueueSize(queueSize);
    setPvpMatch(match);

    if (state === "ready" || data?.matched) {
      applyPvpMatch(data);
      return "ready";
    }

    if (state === "cancelled") {
      stopPvpPolling();
      stopPvpRevealAnimation();
      setPvpSearching(false);
      setPvpAcceptBusy(false);
      setPvpBanBusy(false);
      setPvpRevealIndex(0);
      setStatus(pvpCancelReasonText(String(data?.cancelReason || match?.cancelReason || "")));
      return "cancelled";
    }

    setPvpSearching(state === "waiting" || state === "matching");
    return state;
  };

  const pollPvpQueueStatus = async (ticketIdArg = pvpTicketRef.current) => {
    const ticketId = String(ticketIdArg || "").trim();
    if (!ticketId || !isLoggedIn) return;
    try {
      const res = await fetch(`${API_BASE}/pvp/queue/status?ticketId=${encodeURIComponent(ticketId)}`, {
        headers: { ...authHeaders },
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) {
        if (res.status === 404) resetPvpQueueState();
        return;
      }
      applyPvpStatusPayload(data);
    } catch {
      // ignore transient matchmaking poll errors
    }
  };

  const startPvpPolling = (ticketId) => {
    const normalized = String(ticketId || "").trim();
    if (!normalized) return;
    stopPvpPolling();
    pollPvpQueueStatus(normalized);
    pvpPollRef.current = window.setInterval(() => {
      pollPvpQueueStatus(normalized);
    }, 900);
  };

  const joinPvpQueue = async () => {
    if (!isLoggedIn) {
      setNeedLoginReturnMode("pvp");
      setShowNeedLoginPopup(true);
      return;
    }
    if (isInRaceRoom) {
      setStatus(L("이미 경기 방에 참여 중입니다.", "You are already in a match room."));
      return;
    }
    if (pvpSearching) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/pvp/queue/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({}),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("매칭 대기열 참가 실패", "Failed to join matchmaking queue"));
      const nextState = applyPvpStatusPayload(data);
      if (nextState === "ready" || nextState === "cancelled") {
        return;
      }
      setStatus(
        nextState === "matching"
          ? L("수락 요청 도착. ACCEPT MATCH를 눌러주세요.", "Acceptance requested. Press ACCEPT MATCH.")
          : L("상대를 찾는 중...", "Searching for opponent...")
      );
      setPlayMode("pvp");
      startPvpPolling(String(data.ticketId || ""));
      playSfx("ui");
    } catch (err) {
      const message = String(err.message || "");
      if (message.includes("Placement required")) {
        setPlayMode("menu");
        setShowPlacementRequiredPopup(true);
        setStatus(L("PvP 입장 전 배치고사를 완료해야 합니다.", "You must complete placement before entering PvP."));
      } else {
        setStatus(message);
      }
      resetPvpQueueState();
    } finally {
      setIsLoading(false);
    }
  };

  const cancelPvpQueue = async ({ silent = false } = {}) => {
    const ticketId = String(pvpTicketRef.current || pvpTicketId || "").trim();
    if (!ticketId) {
      resetPvpQueueState();
      return;
    }
    try {
      await fetch(`${API_BASE}/pvp/queue/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ticketId }),
      });
    } catch {
      // ignore cancellation errors
    }
    resetPvpQueueState();
    if (!silent) setStatus(L("매칭 대기를 취소했습니다.", "Matchmaking cancelled."));
  };

  const acceptPvpMatch = async () => {
    const ticketId = String(pvpTicketRef.current || pvpTicketId || "").trim();
    if (!ticketId || !isLoggedIn || pvpAcceptBusy) return;
    setPvpAcceptBusy(true);
    try {
      const res = await fetch(`${API_BASE}/pvp/match/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ticketId }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("수락 처리 실패", "Failed to accept match"));
      applyPvpStatusPayload(data);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setPvpAcceptBusy(false);
    }
  };

  const submitPvpBan = async (sizeKey = "") => {
    const ticketId = String(pvpTicketRef.current || pvpTicketId || "").trim();
    if (!ticketId || !isLoggedIn || pvpBanBusy) return;
    setPvpBanBusy(true);
    try {
      const body = sizeKey
        ? { ticketId, sizeKey }
        : { ticketId, skip: true };
      const res = await fetch(`${API_BASE}/pvp/match/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("밴 처리 실패", "Failed to submit ban"));
      applyPvpStatusPayload(data);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setPvpBanBusy(false);
    }
  };

  const leaveRace = async () => {
    const willLeaveDuringMatch =
      Boolean(raceRoomCode && racePlayerId) &&
      isModePvp &&
      (racePhase === "countdown" || racePhase === "playing");
    if (willLeaveDuringMatch) {
      const ok = window.confirm(
        L(
          "게임 종료 전에 나가면 즉시 패배 처리됩니다. 정말 나갈까요?",
          "Leaving before the match ends counts as an immediate defeat. Leave anyway?"
        )
      );
      if (!ok) return;
    }
    let leaveStatusMessage = "";
    if (pvpSearching && !raceRoomCode && !racePlayerId) {
      await cancelPvpQueue({ silent: true });
    }
    const ticketId = String(pvpTicketRef.current || pvpTicketId || "").trim();
    if (ticketId) {
      try {
        await fetch(`${API_BASE}/pvp/queue/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId }),
        });
      } catch {
        // ignore pvp ticket cleanup errors
      }
    }
    if (raceRoomCode && racePlayerId) {
      try {
        const res = await fetch(`${API_BASE}/race/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId }),
        });
        const data = await parseJsonSafe(res);
        if (willLeaveDuringMatch && data?.ok) {
          leaveStatusMessage = L(
            "게임 종료 전에 방을 나가 즉시 패배 처리되었습니다.",
            "You left before the match ended and were marked as defeated."
          );
        }
      } catch {
        // ignore leave API errors
      }
    }
    if (racePollRef.current) {
      clearInterval(racePollRef.current);
      racePollRef.current = 0;
    }
    resetPvpQueueState();
    setRaceRoomCode("");
    setRacePlayerId("");
    setRaceState(null);
    setRaceSubmitting(false);
    setChatInput("");
    setShowEmojiPicker(false);
    setShowMultiResultModal(false);
    setPublicRooms([]);
    setStatus(leaveStatusMessage);
    raceFinishedSentRef.current = false;
    raceResultShownRef.current = false;
    raceProgressLastSentRef.current = 0;
    setTimerRunning(true);
    playSfx("ui");
  };

  const applyRaceRoomState = (room, playerIdOverride = racePlayerId) => {
    setRaceState(room);
    const me = room?.players?.find((p) => p.playerId === playerIdOverride);
    if (me && Number.isInteger(me.elapsedSec)) {
      setElapsedSec(me.elapsedSec);
    }
  };

  const pollRaceRoom = async (roomCode, playerId = racePlayerId) => {
    if (!roomCode) return;
    try {
      const qs = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
      const res = await fetch(`${API_BASE}/race/${roomCode}${qs}`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) return;
      applyRaceRoomState(data.room);
    } catch {
      // ignore intermittent poll errors
    }
  };

  const startRacePolling = (roomCode, playerId) => {
    if (racePollRef.current) clearInterval(racePollRef.current);
    pollRaceRoom(roomCode, playerId);
    racePollRef.current = window.setInterval(() => {
      pollRaceRoom(roomCode, playerId);
    }, 700);
  };

  const createRaceRoom = async () => {
    const roomTitle = createRoomTitle.trim();
    const maxPlayers = Number(createMaxPlayers);
    const visibility = createVisibility === "private" ? "private" : "public";
    const password = createPassword.trim();
    if (!isLoggedIn) {
      setStatus(L("멀티플레이는 로그인 후 이용 가능해.", "Multiplayer is available after login."));
      return;
    }
    const [wStr, hStr] = createSize.split("x");
    const width = Number(wStr);
    const height = Number(hStr);
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      setStatus("Invalid size selection.");
      return;
    }
    if (visibility === "private" && !password) {
      setStatus(L("비밀방 비밀번호를 입력해줘.", "Enter a password for the private room."));
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          roomTitle,
          width,
          height,
          maxPlayers,
          visibility,
          password: visibility === "private" ? password : "",
        }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to create room.");
      setRaceRoomCode(data.roomCode);
      setRacePlayerId(data.playerId);
      applyRaceRoomState(data.room, data.playerId);
      setSelectedSize(createSize);
      setCreatePassword("");
      setShowCreateModal(false);
      initializePuzzle(data.puzzle, {
        resume: false,
        startTimer: false,
        message: `Room ${data.roomCode} created. Wait for ready.`,
      });
      startRacePolling(data.roomCode, data.playerId);
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const joinRaceRoomWith = async (roomCodeArg, passwordArg = "") => {
    const code = String(roomCodeArg || "").trim().toUpperCase();
    const password = String(passwordArg || "").trim();
    if (!isLoggedIn) {
      setStatus(L("멀티플레이는 로그인 후 이용 가능해.", "Multiplayer is available after login."));
      return;
    }
    if (!code) {
      setStatus(L("방 코드를 입력해줘.", "Enter a room code."));
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ roomCode: code, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to join room.");
      setRaceRoomCode(data.roomCode);
      setRacePlayerId(data.playerId);
      applyRaceRoomState(data.room, data.playerId);
      initializePuzzle(data.puzzle, {
        resume: false,
        startTimer: false,
        message: `Joined room ${data.roomCode}. Press ready.`,
      });
      startRacePolling(data.roomCode, data.playerId);
      setJoinPassword("");
      setShowJoinModal(false);
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const joinRaceRoom = async () => {
    await joinRaceRoomWith(joinRoomCode, joinPassword);
  };

  const setReady = async (ready) => {
    if (!raceRoomCode || !racePlayerId) return;
    try {
      const res = await fetch(`${API_BASE}/race/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId, ready }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update ready.");
      applyRaceRoomState(data.room);
      playSfx("ready");
    } catch (err) {
      setStatus(err.message);
    }
  };

  const startRace = async () => {
    if (!raceRoomCode || !racePlayerId) return;
    try {
      const res = await fetch(`${API_BASE}/race/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to start race.");
      applyRaceRoomState(data.room);
      playSfx("ui");
      setStatus(L("5초 후 시작합니다.", "Starting in 5 seconds."));
    } catch (err) {
      setStatus(err.message);
    }
  };

  const requestRematch = async () => {
    if (!raceRoomCode || !racePlayerId) return;
    setIsRematchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to rematch.");
      applyRaceRoomState(data.room);
      if (data.puzzle) {
        initializePuzzle(data.puzzle, {
          resume: false,
          startTimer: false,
          message: L("새 게임 준비 완료. 다시 Ready를 눌러 시작해.", "New game is ready. Press Ready again."),
        });
        playSfx("ui");
      }
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsRematchLoading(false);
    }
  };

  const submitRaceProgress = async () => {
    if (!raceRoomCode || !racePlayerId) return;
    if (raceProgressBusyRef.current) return;
    raceProgressBusyRef.current = true;
    try {
      if (!puzzle) return;
      const userBitsBase64 = toBase64Bits(cellValuesRef.current, puzzle.width, puzzle.height);
      await fetch(`${API_BASE}/race/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId, userBitsBase64 }),
      });
    } catch {
      // ignore transient progress errors
    } finally {
      raceProgressBusyRef.current = false;
    }
  };

  const submitRaceFinish = async () => {
    if (!raceRoomCode || !racePlayerId || raceFinishedSentRef.current || !isRacePlaying) return;
    raceFinishedSentRef.current = true;
    setRaceSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/race/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: raceRoomCode,
          playerId: racePlayerId,
          elapsedSec,
        }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to submit finish.");
      applyRaceRoomState(data.room);
    } catch (err) {
      raceFinishedSentRef.current = false;
      setStatus(err.message);
    } finally {
      setRaceSubmitting(false);
    }
  };

  const submitSingleFinish = async () => {
    if (!puzzle || isInRaceRoom || isModeTutorial) return;
    try {
      const res = await fetch(`${API_BASE}/single/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          puzzleId: Number(puzzle.id),
          width: Number(puzzle.width),
          height: Number(puzzle.height),
          elapsedSec,
        }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save single log.");
      }
    } catch {
      // ignore logging errors in solo play UX
    }
  };

  const sendRaceChat = async () => {
    if (!raceRoomCode || !racePlayerId) return;
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch(`${API_BASE}/race/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId, text }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("채팅 전송 실패", "Failed to send chat"));
      applyRaceRoomState(data.room);
      setChatInput("");
      setShowEmojiPicker(false);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setChatSending(false);
    }
  };

  const flushQueuedPaint = () => {
    frameRef.current = 0;
    const pending = pendingPaintRef.current;
    if (pending.size === 0) return;
    const prev = cellValuesRef.current;
    const next = [...prev];
    let changed = false;
    for (const [index, value] of pending.entries()) {
      if (next[index] !== value) {
        next[index] = value;
        changed = true;
      }
    }
    pending.clear();
    if (!changed) return;
    strokeChangedRef.current = true;
    cellValuesRef.current = next;
    setCells(next);
  };

  const queueCellPaint = (index, value) => {
    const pending = pendingPaintRef.current;
    const current = pending.has(index) ? pending.get(index) : (cellValuesRef.current[index] ?? 0);
    // Prevent filled-paint from overwriting X marks.
    if (value === 1 && current === 2) return;
    pendingPaintRef.current.set(index, value);
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(flushQueuedPaint);
    }
  };

  const paintLine = (fromIndex, toIndex, value) => {
    if (!puzzle) return;
    const width = puzzle.width;
    const x0 = fromIndex % width;
    const y0 = Math.floor(fromIndex / width);
    const x1 = toIndex % width;
    const y1 = Math.floor(toIndex / width);

    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      queueCellPaint(y * width + x, value);
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  };

  const paintToIndex = (index) => {
    const dragState = dragRef.current;
    if (!dragState) return;
    const last = lastPaintIndexRef.current;
    if (last == null) {
      queueCellPaint(index, dragState.paintValue);
    } else {
      paintLine(last, index, dragState.paintValue);
    }
    lastPaintIndexRef.current = index;
  };

  const startPaint = (index, buttonType, options = {}) => {
    const current = cellValuesRef.current[index] ?? 0;
    const paintValue =
      buttonType === "left"
        ? current === 1
          ? 0
          : 1
        : current === 2
          ? 0
          : 2;

    if (!dragRef.current) {
      strokeBaseRef.current = cellValuesRef.current.slice();
      strokeChangedRef.current = false;
    }
    dragRef.current = { button: buttonType, paintValue, ignoreButtons: options.ignoreButtons === true };
    lastPaintIndexRef.current = index;
    queueCellPaint(index, paintValue);
    const now = Date.now();
    if (now - lastPaintSfxAtRef.current > 30) {
      playSfx(paintValue === 2 ? "paint-x" : "paint-fill");
      lastPaintSfxAtRef.current = now;
    }
  };

  const onCellPointerDown = (event, index) => {
    event.preventDefault();
    boardRef.current?.setPointerCapture?.(event.pointerId);
    const pointerType = String(event.pointerType || "").toLowerCase();
    const isTouchLike =
      pointerType === "touch" ||
      pointerType === "pen" ||
      (isCoarsePointer && pointerType !== "mouse");
    if (isTouchLike && event.button !== 2) {
      const modeButton = mobilePaintMode === "mark" ? "right" : "left";
      startPaint(index, modeButton, { ignoreButtons: true });
      return;
    }
    if (event.button === 0) startPaint(index, "left");
    if (event.button === 2) startPaint(index, "right");
  };

  const onBoardPointerDown = (event) => {
    if (!canInteractBoard) return;
    const index = getIndexFromClientPoint(event.clientX, event.clientY);
    if (index == null) return;
    onCellPointerDown(event, index);
  };

  const getIndexFromClientPoint = (clientX, clientY) => {
    if (!puzzle || !boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
      return null;
    }
    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    const col = Math.min(puzzle.width - 1, Math.max(0, Math.floor(xRatio * puzzle.width)));
    const row = Math.min(puzzle.height - 1, Math.max(0, Math.floor(yRatio * puzzle.height)));
    return row * puzzle.width + col;
  };

  useEffect(() => {
    if (!puzzle || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = puzzle.width * cellSize;
    const h = puzzle.height * cellSize;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const palette = uiStyleVariant === "excel"
      ? {
          empty: "rgba(255, 255, 255, 0.08)",
          filled: "#fffae0",
          filledBorder: "#b9aa63",
          mark: "#1d4f96",
          grid: "rgba(122, 143, 168, 0.9)",
          gridStrong: "rgba(76, 99, 128, 0.95)",
          border: "rgba(76, 99, 128, 0.95)",
        }
      : isDarkMode
      ? {
          empty: "#0f172a",
          filled: "#e2e8f0",
          filledBorder: "#64748b",
          mark: "#f87171",
          grid: "#475569",
          gridStrong: "#e2e8f0",
          border: "#f8fafc",
        }
      : {
          empty: "#e6e6e6",
          filled: "#1d1d1d",
          filledBorder: "#7f8d9b",
          mark: "#8f0000",
          grid: "#444",
          gridStrong: "#111",
          border: "#111",
        };

    ctx.fillStyle = palette.empty;
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < puzzle.height; y += 1) {
      for (let x = 0; x < puzzle.width; x += 1) {
        const v = cells[y * puzzle.width + x];
        const px = x * cellSize;
        const py = y * cellSize;
        if (v === 1) {
          ctx.fillStyle = palette.filled;
          ctx.fillRect(px, py, cellSize, cellSize);
          // Filled cells keep a subtle border so adjacent blacks remain distinguishable.
          ctx.strokeStyle = palette.filledBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
        } else if (v === 2) {
          ctx.strokeStyle = palette.mark;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 4);
          ctx.lineTo(px + cellSize - 4, py + cellSize - 4);
          ctx.moveTo(px + cellSize - 4, py + 4);
          ctx.lineTo(px + 4, py + cellSize - 4);
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = uiStyleVariant === "excel" ? 1.15 : 1;
    for (let x = 0; x <= puzzle.width; x += 1) {
      const px = x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let y = 0; y <= puzzle.height; y += 1) {
      const py = y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.gridStrong;
    ctx.lineWidth = uiStyleVariant === "excel" ? 1.9 : 2;
    for (let x = 5; x < puzzle.width; x += 5) {
      const px = x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let y = 5; y < puzzle.height; y += 5) {
      const py = y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, [puzzle, cells, cellSize, isDarkMode, uiStyleVariant]);

  useEffect(() => {
    const onWindowPointerMove = (event) => {
      const dragState = dragRef.current;
      if (!dragState) return;

      if (!dragState.ignoreButtons) {
        const leftPressed = (event.buttons & 1) === 1;
        const rightPressed = (event.buttons & 2) === 2;
        if (dragState.button === "left" && !leftPressed) return;
        if (dragState.button === "right" && !rightPressed) return;
      }

      const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
      for (const e of events) {
        const idx = getIndexFromClientPoint(e.clientX, e.clientY);
        if (idx != null) paintToIndex(idx);
      }
    };

    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onWindowPointerMove);
  }, [puzzle]);

  useEffect(() => {
    const endDrag = () => {
      if (dragRef.current && strokeChangedRef.current && strokeBaseRef.current) {
        pushUndo(strokeBaseRef.current);
      }
      dragRef.current = null;
      lastPaintIndexRef.current = null;
      strokeBaseRef.current = null;
      strokeChangedRef.current = false;
    };
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("pointerup", endDrag);
    };
  }, []);

  const resetGrid = () => {
    if (!puzzle) return;
    pushUndo(cellValuesRef.current.slice());
    applySnapshot(new Array(puzzle.width * puzzle.height).fill(0));
    setActiveHints(new Set());
    autoSolvedShownRef.current = false;
    setElapsedSec(0);
    setTimerRunning(true);
    setStatus("Grid cleared.");
    playSfx("clear");
  };

  const toggleHint = (hintId) => {
    setActiveHints((prev) => {
      const next = new Set(prev);
      if (next.has(hintId)) next.delete(hintId);
      else next.add(hintId);
      return next;
    });
  };

  useEffect(() => {
    if (!puzzle) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`nonogram-progress-${puzzle.id}`, JSON.stringify(cells));
    }, 250);
    return () => clearTimeout(timer);
  }, [cells, puzzle]);

  useEffect(() => {
    if (!puzzle || !timerRunning) return undefined;
    if (isInRaceRoom) return undefined;
    const id = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [puzzle, timerRunning, isInRaceRoom]);

  useEffect(() => {
    if (!isRacePlaying || !raceRoomCode || !racePlayerId) return;
    const now = Date.now();
    if (now - raceProgressLastSentRef.current < 220) return;
    raceProgressLastSentRef.current = now;
    submitRaceProgress();
  }, [isRacePlaying, raceRoomCode, racePlayerId, cells, puzzle]);

  useEffect(() => {
    const shouldTickRace = isInRaceRoom && (isRaceCountdown || isRacePlaying);
    const shouldTickPvp =
      isModePvp &&
      !isInRaceRoom &&
      pvpSearching &&
      (pvpMatchState === "accept" || pvpMatchState === "ban" || pvpMatchState === "reveal");
    const shouldTickPlacement = isModePlacementTest && (placementRunning || Boolean(matchFlowTest?.active));
    if (!shouldTickRace && !shouldTickPvp && !shouldTickPlacement) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [isInRaceRoom, isRaceCountdown, isRacePlaying, isModePvp, pvpSearching, pvpMatchState, isModePlacementTest, placementRunning, matchFlowTest?.active]);

  useEffect(() => {
    if (!isInRaceRoom || !raceState?.gameStartAt) return;
    if (isRacePlaying) {
      const sec = Math.max(0, Math.floor((nowMs - new Date(raceState.gameStartAt).getTime()) / 1000));
      setElapsedSec(sec);
    } else if (isRaceCountdown || isRaceLobby) {
      setElapsedSec(0);
    }
  }, [isInRaceRoom, isRacePlaying, isRaceCountdown, isRaceLobby, raceState, nowMs]);

  useEffect(() => {
    if (!isModePlacementTest || !placementRunning) return;
    if (placementLeftSec > 0) return;
    void finishPlacementTest(true);
  }, [isModePlacementTest, placementRunning, placementLeftSec]);

  useEffect(() => {
    if (!isModePlacementTest || !matchSimSearching || matchSimFound) return undefined;
    const sessionId = matchSimSessionRef.current;
    const id = setInterval(() => {
      if (matchSimSessionRef.current !== sessionId) return;
      const nextSec = Math.min(MATCH_SIM_MAX_WAIT_SEC, matchSimElapsedRef.current + 1);
      matchSimElapsedRef.current = nextSec;
      setMatchSimElapsedSec(nextSec);
      const nextRule = getMatchSimRule(nextSec);
      const nextQueueSize = getMatchSimQueueSize(nextSec, matchSimRating);
      setMatchSimQueueSize(nextQueueSize);

      if (nextRule.key !== matchSimLastRuleKeyRef.current) {
        matchSimLastRuleKeyRef.current = nextRule.key;
        pushMatchSimLog(
          `탐색 단계 전환: ${nextRule.labelKo}`,
          `Search stage changed: ${nextRule.labelEn}`,
          "info"
        );
        if (nextRule.key === "adjacent") {
          pushMatchSimLog(
            "최근 상대한 상대는 우선순위를 낮추고 다음 후보를 확인합니다.",
            "Recent opponents are deprioritized while the queue widens.",
            "muted"
          );
        }
      } else if (nextSec === 14 || nextSec === 29 || nextSec === 43) {
        pushMatchSimLog(
          `대기열 변동 감지: 현재 후보 ${nextQueueSize}명`,
          `Queue updated: ${nextQueueSize} candidates visible`,
          "muted"
        );
      }

      const foundCandidate = pickMatchSimCandidate(matchSimRating, nextSec);
      if (foundCandidate) {
        setMatchSimFound(foundCandidate);
        setMatchSimSearching(false);
        pushMatchSimLog(
          `${foundCandidate.nickname} 매칭 완료 · ${foundCandidate.matchedAtSec}초`,
          `${foundCandidate.nickname} matched in ${foundCandidate.matchedAtSec}s`,
          "success"
        );
        pushMatchSimLog(foundCandidate.reasonKo, foundCandidate.reasonEn, foundCandidate.source === "bot" ? "warn" : "accent");
        setStatus(
          L(
            `${foundCandidate.nickname}와 매칭되었습니다.`,
            `Matched with ${foundCandidate.nickname}.`
          )
        );
        playSfx("ui");
      }
    }, 180);
    return () => clearInterval(id);
  }, [isModePlacementTest, matchSimSearching, matchSimFound, matchSimRating]);

  useEffect(() => () => clearMatchFlowTimers(), []);

  useEffect(() => {
    if (!puzzle) {
      autoSolvedShownRef.current = false;
      return;
    }
    if (isBoardCompleteByHints && !autoSolvedShownRef.current) {
      autoSolvedShownRef.current = true;
      setTimerRunning(false);
      if (isModePlacementTest && !isInRaceRoom && placementRunning) {
        setStatus(L("단계 완료! 다음 퍼즐로 이동합니다.", "Stage cleared! Moving to next puzzle."));
        void handlePlacementStageSolved();
      } else if (isModeTutorial) {
        // Tutorial completion status is handled by tutorial progress effect.
      } else if (isInRaceRoom && isRacePlaying) {
        setStatus(L("완주! 다른 플레이어 결과 대기중...", "Finished! Waiting for other players..."));
        submitRaceFinish();
      } else {
        setStatus("Success! Puzzle solved.");
        if (isModeSingle && !isInRaceRoom) {
          submitSingleFinish();
        }
      }
    }
    if (!isBoardCompleteByHints) {
      autoSolvedShownRef.current = false;
    }
  }, [
    isBoardCompleteByHints,
    puzzle,
    isInRaceRoom,
    isRacePlaying,
    isModePlacementTest,
    placementRunning,
    isModeTutorial,
    isModeSingle,
  ]);

  useEffect(() => {
    if (!isInRaceRoom || racePhase !== "finished" || !raceState?.winnerPlayerId || raceResultShownRef.current) return;
    raceResultShownRef.current = true;
    if (raceState.winnerPlayerId === racePlayerId) {
      setStatus(L("승리하였습니다.", "Victory."));
      playSfx("win");
    } else {
      if (myRacePlayer?.loseReason === "inactive_timeout") {
        setStatus(
          L(
            "경고: 1분 동안 움직임이 없어 자동 패배 처리되었습니다.",
            "Warning: You were inactive for 60 seconds and lost automatically."
          )
        );
      } else {
        setStatus(L("패배하였습니다.", "Defeat."));
      }
      setTimerRunning(false);
      playSfx("lose");
    }
  }, [isInRaceRoom, racePhase, raceState, racePlayerId, myRacePlayer, L]);

  useEffect(() => {
    if (!showMultiResultModal) return;
    if (!isModeMulti || !isInRaceRoom || racePhase !== "finished") {
      setShowMultiResultModal(false);
    }
  }, [showMultiResultModal, isModeMulti, isInRaceRoom, racePhase]);

  useEffect(() => {
    if (!isModeMulti || !isInRaceRoom || racePhase !== "finished" || !raceResultKey) return;
    if (multiResultShownKeyRef.current === raceResultKey) return;
    multiResultShownKeyRef.current = raceResultKey;
    setShowMultiResultModal(true);
  }, [isModeMulti, isInRaceRoom, racePhase, raceResultKey]);

  useEffect(() => {
    if (!isLoggedIn || !isModePvp || !isInRaceRoom || racePhase !== "finished" || !raceRoomCode) return;
    if (pvpAuthRefreshDoneRoomRef.current === raceRoomCode) return;
    if (raceState?.ratedResultApplied !== true) return;

    let cancelled = false;
    let retryTimer = 0;

    const refreshAuth = async (attempt = 0) => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { ...authHeaders } });
        const data = await parseJsonSafe(res);
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data?.user) throw new Error("auth_refresh_failed");
        cacheAuthUser(data.user, { applyPrefs: true });
        pvpAuthRefreshDoneRoomRef.current = raceRoomCode;
      } catch {
        if (cancelled || attempt >= 4) return;
        retryTimer = window.setTimeout(() => {
          refreshAuth(attempt + 1);
        }, 350);
      }
    };

    refreshAuth(0);
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    isLoggedIn,
    isModePvp,
    isInRaceRoom,
    racePhase,
    raceRoomCode,
    raceState?.ratedResultApplied,
    authHeaders,
  ]);

  useEffect(() => {
    if (!isLoggedIn || !isModePvp || !isInRaceRoom || racePhase !== "finished" || !raceRoomCode) return;
    if (pvpRatingFxDoneRoomRef.current === raceRoomCode) return;
    const fromRating = Number(pvpRatingBaseRef.current);
    const fromGames = Number(pvpRatingBaseGamesRef.current);
    const toRating = Number(authUser?.rating);
    const toGames = Number(authUser?.rating_games);
    const didWin = raceState?.winnerPlayerId === racePlayerId;
    if (!Number.isFinite(fromRating) || !Number.isFinite(fromGames)) return;
    if (!Number.isFinite(toRating) || !Number.isFinite(toGames)) return;
    if (toGames <= fromGames) return;
    pvpRatingFxDoneRoomRef.current = raceRoomCode;
    startPvpRatingAnimation(fromRating, toRating, raceRoomCode, {
      result: didWin ? "win" : "loss",
    });
  }, [isLoggedIn, isModePvp, isInRaceRoom, racePhase, raceRoomCode, authUser?.rating, authUser?.rating_games, raceState?.winnerPlayerId, racePlayerId]);

  useEffect(() => {
    if (!isRaceCountdown || countdownLeft == null) {
      countdownCueRef.current = -1;
      return;
    }
    if (countdownLeft !== countdownCueRef.current) {
      countdownCueRef.current = countdownLeft;
      playSfx("countdown");
    }
  }, [isRaceCountdown, countdownLeft]);

  useEffect(() => {
    if (!showInactivityWarning) {
      inactivityWarnCueRef.current = -1;
      return;
    }
    if (inactivityLeftSec === inactivityWarnCueRef.current) return;
    inactivityWarnCueRef.current = inactivityLeftSec;
    if (inactivityLeftSec <= 3) playSfx("ready");
    else playSfx("countdown");
  }, [showInactivityWarning, inactivityLeftSec]);

  useEffect(() => {
    const prev = prevRacePhaseRef.current;
    if (prev === "countdown" && racePhase === "playing") {
      playSfx("go");
    }
    prevRacePhaseRef.current = racePhase;
  }, [racePhase]);

  useEffect(() => {
    const phase = pvpMatchState || "";
    const prev = pvpMatchPhaseRef.current;
    if (phase !== prev) {
      if (phase === "accept") playSfx("ready");
      else if (phase === "ban") playSfx("ui");
      else if (phase === "reveal") playSfx("countdown");
      else if (phase === "cancelled") playSfx("lose");
    }
    pvpMatchPhaseRef.current = phase;
  }, [pvpMatchState]);

  useEffect(() => {
    if (!isModePvp || isInRaceRoom || !pvpSearching) return;
    const matchId = String(pvpMatch?.matchId || "").trim();
    if (!matchId) return;
    const shouldShow = pvpMatchState === "ban" || (pvpMatchState === "accept" && pvpAllAccepted);
    if (!shouldShow) return;
    if (pvpShowdownSeenRef.current === matchId) return;
    pvpShowdownSeenRef.current = matchId;
    setPvpShowdownMatchId(matchId);
    setPvpShowdownUntilMs(Date.now() + 5200);
    playSfx("go");
  }, [isModePvp, isInRaceRoom, pvpSearching, pvpMatch?.matchId, pvpMatchState, pvpAllAccepted]);

  useEffect(() => {
    if (!isModePvp || !pvpSearching || isInRaceRoom || pvpMatchState !== "reveal" || pvpDisplayOptions.length === 0) {
      stopPvpRevealAnimation();
      return;
    }
    if (!isPvpRevealSpinning) {
      stopPvpRevealAnimation();
      const chosenIdx = pvpDisplayOptions.findIndex((o) => o.sizeKey === pvpMatch?.chosenSizeKey);
      if (chosenIdx >= 0) setPvpRevealIndex(chosenIdx);
      return;
    }

    stopPvpRevealAnimation();
    let idx = Math.floor(Math.random() * pvpDisplayOptions.length);
    setPvpRevealIndex(idx);
    pvpRevealAnimRef.current = window.setInterval(() => {
      idx = (idx + 1) % pvpDisplayOptions.length;
      setPvpRevealIndex(idx);
      playSfx("roulette-tick");
    }, 95);
    return () => {
      stopPvpRevealAnimation();
    };
  }, [isModePvp, pvpSearching, isInRaceRoom, pvpMatchState, pvpDisplayOptions, pvpMatch?.chosenSizeKey, isPvpRevealSpinning]);

  useEffect(() => {
    if (pvpMatchState !== "reveal") {
      pvpRevealSpinPrevRef.current = false;
      return;
    }
    if (pvpRevealSpinPrevRef.current && !isPvpRevealSpinning) {
      playSfx("roulette-stop");
    }
    pvpRevealSpinPrevRef.current = isPvpRevealSpinning;
  }, [pvpMatchState, isPvpRevealSpinning]);

  useEffect(() => {
    if (!isInRaceRoom || !raceState?.puzzleId) return;
    if (puzzle?.id === raceState.puzzleId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/puzzles/${raceState.puzzleId}`);
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok || cancelled) return;
        initializePuzzle(data.puzzle, {
          resume: false,
          startTimer: false,
          message: L(`방 퍼즐이 변경됨: ${data.puzzle.id}`, `Room puzzle changed: ${data.puzzle.id}`),
        });
      } catch {
        // ignore transient sync errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInRaceRoom, raceState?.puzzleId, puzzle?.id]);

  useEffect(() => {
    if (isInRaceRoom || !isModeMulti) return;
    fetchPublicRooms();
  }, [isInRaceRoom, isModeMulti]);

  useEffect(() => {
    if ((!isModeRanking && !isModeLegacyRanking) || isInRaceRoom) return;
    void fetchRatingUsers(isModeLegacyRanking ? "legacy" : "current");
  }, [isModeRanking, isModeLegacyRanking, isInRaceRoom]);

  useEffect(() => {
    if (!isModeReplayHall || isInRaceRoom) return;
    fetchBestReplayRecords();
  }, [isModeReplayHall, isInRaceRoom]);

  useEffect(() => {
    if (isLoggedIn) return;
    resetPvpQueueState();
  }, [isLoggedIn]);

  useEffect(() => {
    if (isInRaceRoom) return;
    if (isRaceOnlyStatusMessage(status)) {
      setStatus("");
    }
  }, [isInRaceRoom, status]);

  useEffect(() => {
    if (!isModeTutorial) return;
    if (tutorialAllDone) {
      if (!tutorialCompleteShownRef.current) {
        tutorialCompleteShownRef.current = true;
        markTutorialSeen();
        playSfx("win");
      }
    }
  }, [isModeTutorial, tutorialAllDone]);

  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages.length, isInRaceRoom]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDocPointerDown = (event) => {
      if (!emojiWrapRef.current) return;
      if (!emojiWrapRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [showEmojiPicker]);

  const isExcelMode = uiStyleVariant === "excel";
  const isDarkThemeActive = isDarkMode && !isExcelMode;
  const brandTitle = "Nonogram Arena";
  const modeTagText = L("로그인 필요", "Login Required");
  const excelMainStyle = isExcelMode ? { "--excel-cell-size": `${cellSize}px` } : undefined;
  const placementDisplayCard = placementResultCard
    || (hasPlacementQualification && placementAssignedTier
      ? {
          rating: placementAssignedRating,
          tier: placementAssignedTier,
          solvedSequential: Number(authUser?.placement_solved_sequential || 0),
          elapsedSec: Number(authUser?.placement_elapsed_sec || 0),
        }
      : null);
  const placementResultTierKey = placementDisplayCard?.tier?.key || "bronze";
  const placementResultTierClass = placementDisplayCard ? `tier-${placementResultTierKey}` : "";
  const placementResultElapsedText = (() => {
    const totalSec = Math.max(0, Number(placementDisplayCard?.elapsedSec || 0));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();
  const placementResultTierLabel = placementDisplayCard
    ? lang === "ko"
      ? placementDisplayCard.tier.labelKo
      : placementDisplayCard.tier.labelEn
    : "";
  const pvpModeTagText = !isLoggedIn
    ? modeTagText
    : !hasPlacementQualification
      ? L("배치고사 필요", "Placement Required")
      : "";
  const pvpFxBracketNow = pvpRatingFx ? getTierBracketInfo(pvpRatingFx.ratingNow, pvpRatingFx.done ? pvpRatingFx.toRank : pvpRatingFx.fromRank) : null;
  const pvpFxTierNow = pvpFxBracketNow?.tier || pvpRatingFx?.toTier || null;
  const pvpFxTierClass = pvpFxTierNow ? `tier-${pvpFxTierNow.key}` : "";
  const pvpFxTierLabel = pvpFxTierNow ? (lang === "ko" ? pvpFxTierNow.labelKo : pvpFxTierNow.labelEn) : "";
  const pvpFxFromTierLabel = pvpRatingFx?.fromTier
    ? lang === "ko"
      ? pvpRatingFx.fromTier.labelKo
      : pvpRatingFx.fromTier.labelEn
    : "";
  const pvpFxToTierLabel = pvpRatingFx?.toTier
    ? lang === "ko"
      ? pvpRatingFx.toTier.labelKo
      : pvpRatingFx.toTier.labelEn
    : "";
  const pvpFxOutcomeLabel = pvpRatingFx?.result === "loss" ? L("패배", "Defeat") : L("승리", "Victory");
  const pvpFxOutcomeSub = pvpRatingFx?.result === "loss" ? L("레이팅 하락", "Rating Lost") : L("레이팅 상승", "Rating Gained");
  const pvpFxShiftLabel =
    pvpRatingFx?.tierShift === "promoted"
      ? L("티어 승급", "Promotion")
      : pvpRatingFx?.tierShift === "demoted"
        ? L("티어 강등", "Demotion")
        : "";
  const pvpFxGaugePercent = Math.max(0, Math.min(100, Number(pvpFxBracketNow?.progress || 0)));
  const pvpFxNextTierLabel = pvpFxBracketNow?.nextTier
    ? lang === "ko"
      ? pvpFxBracketNow.nextTier.labelKo
      : pvpFxBracketNow.nextTier.labelEn
    : "MAX";
  const pvpFxDeltaText = pvpRatingFx
    ? pvpRatingFx.deltaNow > 0
      ? `+${pvpRatingFx.deltaNow}`
      : String(pvpRatingFx.deltaNow)
    : "";
  const pvpFxRouteChanged = pvpRatingFx && pvpFxFromTierLabel && pvpFxToTierLabel && pvpFxFromTierLabel !== pvpFxToTierLabel;
  const matchSimTierLabel = lang === "ko" ? matchSimCurrentTier.labelKo : matchSimCurrentTier.labelEn;
  const matchSimRuleLabel = lang === "ko" ? matchSimCurrentRule.labelKo : matchSimCurrentRule.labelEn;
  const matchSimStageIndex = MATCH_SIM_STAGE_FLOW.findIndex((stage) => stage.key === matchSimCurrentRule.key);
  const matchSimFoundTierLabel = matchSimFound?.tier ? (lang === "ko" ? matchSimFound.tier.labelKo : matchSimFound.tier.labelEn) : "";
  const matchSimFoundSourceLabel = matchSimFound
    ? matchSimFound.source === "bot"
      ? L("봇 후보", "Bot Candidate")
      : L("유저 풀", "Human Pool")
    : "";
  const matchFlowPlayers = matchFlowTest
    ? [
        matchFlowTest.me || { nickname: L("테스터", "Tester"), rating: MATCH_FLOW_TEST_BASE_RATING, ratingRank: null },
        matchFlowTest.opponent || MATCH_FLOW_TEST_OPPONENT,
      ]
    : [];
  const profileModalTier = profileModalData
    ? getTierInfoByRating(profileModalData.rating, profileModalData.ratingRank)
    : null;
  const profileModalTierLabel = profileModalTier ? (lang === "ko" ? profileModalTier.labelKo : profileModalTier.labelEn) : "";
  const profileModalAvatarKey = normalizeProfileAvatarKey(
    profileModalMode === "self" ? profileDraftAvatarKey : profileModalData?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY
  );
  const profileModalRankText =
    Number.isInteger(Number(profileModalData?.ratingRank)) && Number(profileModalData?.ratingRank) > 0
      ? lang === "ko"
        ? `${Number(profileModalData.ratingRank)}등`
        : `#${Number(profileModalData.ratingRank)}`
      : "";
  const profileUnlockedSpecialKeys = new Set(
    Array.isArray(profileModalData?.unlockedSpecialAvatarKeys)
      ? profileModalData.unlockedSpecialAvatarKeys.map((key) => normalizeProfileAvatarKey(key))
      : []
  );
  const profileModalHallRewards = Array.isArray(profileModalData?.hallRewards) ? profileModalData.hallRewards : [];
  const profileAvatarDirty =
    profileModalMode === "self" &&
    normalizeProfileAvatarKey(profileModalData?.profile_avatar_key || DEFAULT_PROFILE_AVATAR_KEY) !==
      normalizeProfileAvatarKey(profileDraftAvatarKey);

  return (
    <main className={`page ${isExcelMode ? "excelSkin" : ""} ${isDarkThemeActive ? "themeDark" : ""}`} style={excelMainStyle}>
      <div className="bgGlow bgGlowA" />
      <div className="bgGlow bgGlowB" />
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`panel ${isModeMenu || isModeAuth ? "panelMenu" : ""} ${lang === "en" ? "langEn" : "langKo"}`}
      >
        <div className="topBar">
          <button type="button" className="brandWrap" onClick={backToMenu}>
            <div className="logoPixel" aria-hidden="true" />
            <h1 className="title">{brandTitle}</h1>
          </button>
          {!isModeAuth && (
            <div className="topAuth">
              <button type="button" className="settingsBtn" onClick={openSettingsModal}>
                <Settings size={15} /> {L("설정", "Settings")}
              </button>
              {isLoggedIn ? (
                <>
                  <button type="button" className="userChip userChipBtn" onClick={openOwnProfile}>
                    <ProfileAvatar avatarKey={authUser?.profile_avatar_key} nickname={authUser?.nickname} size="sm" />
                    <span className="userChipText">
                      <strong>{authUser.nickname}</strong>
                      <span>R {Number.isFinite(Number(authUser?.rating)) ? Number(authUser.rating) : 0}</span>
                    </span>
                  </button>
                  <button onClick={logout}>{L("로그아웃", "Logout")}</button>
                </>
              ) : (
                <>
                  <span className="guestIcon" aria-hidden="true">
                    <User size={18} />
                    <ChevronDown size={16} />
                  </span>
                  <button className="ghostBtn" onClick={() => openAuthScreen("login", "menu")}>
                    <LogIn size={15} /> Login
                  </button>
                  <button className="primaryBtn" onClick={() => openAuthScreen("signup", "menu")}>
                    <UserPlus size={15} /> Sign Up
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {isExcelMode && (
          <div className="excelSheetFrame" aria-hidden="true">
            <div className="excelSheetCols">
              {excelSheetCols.map((col) => (
                <span key={`sheet-col-${col}`}>{col}</span>
              ))}
            </div>
            <div className="excelSheetRows">
              {excelSheetRows.map((row) => (
                <span key={`sheet-row-${row}`}>{row}</span>
              ))}
            </div>
          </div>
        )}

        {isModeMenu && (
          <section className="menuStage">
            <div className="modeChooser">
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modeSingle"
                onClick={goSingleMode}
                data-tutorial="menu-single"
              >
                <span className="modeName">SINGLE PLAYER</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modeMulti"
                onClick={goMultiMode}
                data-tutorial="menu-multi"
              >
                {!isLoggedIn && <span className="modeTag">{modeTagText}</span>}
                <span className="modeName">MULTI PLAYER</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modePvp"
                onClick={goPvpMode}
              >
                {pvpModeTagText && <span className="modeTag">{pvpModeTagText}</span>}
                <span className="modeName">PVP MATCH</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modeRank"
                onClick={goRankingMode}
              >
                <span className="modeName">RANKING</span>
              </motion.button>
            </div>
            <button className="menuTutorialBtn" onClick={startTutorialMode}>
              {L("플레이 방법", "HOW TO PLAY")}
            </button>
            {!isExcelMode && (
              <a
                className="discordFab"
                href="https://discord.gg/42Mqmy9Ka"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                title="Discord"
              >
                <img
                  src="/whitediscord.png"
                  alt="Discord"
                />
              </a>
            )}
            <div className="menuDust menuDustA" />
            <div className="menuDust menuDustB" />
            <div className="menuDust menuDustC" />
          </section>
        )}

        {isModePlacementTest && (
          <section className="placementScreen">
            <div className="placementHead">
              <h2>{L("배치고사", "Placement")}</h2>
              <p>
                {hasPlacementQualification
                  ? L(
                      "배치고사가 완료되었습니다. 현재 배정된 티어와 시작 레이팅이 PvP 기준으로 사용됩니다.",
                      "Placement is complete. Your assigned tier and starting rating are now used for PvP."
                    )
                  : L(
                      "5분 동안 5x5 -> 10x10 -> 10x10 -> 15x15 -> 15x15 순서로 실제 퍼즐이 출제됩니다. 풀면 자동으로 다음 단계로 이동합니다.",
                      "Real puzzles are served in order for 5 minutes: 5x5 -> 10x10 -> 10x10 -> 15x15 -> 15x15. Solving one advances automatically."
                    )}
              </p>
              {!hasPlacementQualification && (
                <div className="placementEntryWarning">
                  {L(
                    "주의! 배치고사는 계정당 한 번만 볼 수 있습니다.",
                    "Warning! Placement can only be taken once per account."
                  )}
                </div>
              )}
            </div>

            <div className="placementMeta">
              {placementRunning && (
                <div className="placementTimer">
                  {L("남은 시간", "Time Left")}: <b>{placementTimerText}</b>
                </div>
              )}
            </div>

            <div className="placementActions">
              {!placementRunning && !hasPlacementQualification && (
                <button className="singleActionBtn" onClick={() => void startPlacementTest()} disabled={placementLoading}>
                  {placementLoading ? L("로딩 중...", "Loading...") : L("배치고사 시작", "Start Placement")}
                </button>
              )}
              {!placementRunning && hasPlacementQualification && (
                <button className="singleActionBtn" onClick={goPvpMode}>
                  {L("랭크전 시작", "Start Ranked")}
                </button>
              )}
              <button
                className="singleHomeBtn"
                onClick={() => {
                  resetPlacementTest();
                  void backToMenu();
                }}
              >
                HOME
              </button>
            </div>

            {placementDisplayCard && (
              <div className={`placementResultCard ${placementResultTierClass}`}>
                <div className="placementResultBadge">{L("배치 결과", "Placement Result")}</div>
                <div className="placementTierMedia">
                  <img
                    src={TIER_IMAGE_MAP[placementDisplayCard.tier.key] || TIER_IMAGE_MAP.bronze}
                    alt={placementDisplayCard.tier.labelEn}
                  />
                </div>
                <div className="placementResultText">
                  <div className="placementTierNameRow">
                    <div className="placementTierName">{placementResultTierLabel}</div>
                    <div className="placementTierRating">R {placementDisplayCard.rating}</div>
                  </div>
                </div>
              </div>
            )}
            {placementRevealOpen && placementResultCard && (
              <div className={`placementRevealOverlay ${placementResultTierClass}`}>
                <motion.div
                  className={`placementRevealCard ${placementResultTierClass}`}
                  initial={{ opacity: 0, scale: 0.84, y: 28 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 24, mass: 0.9 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="placementRevealEyebrow">{L("배치 평가", "Placement Evaluation")}</div>
                  {placementRevealPhase !== "reveal" && (
                    <div className="placementRevealHead">
                      {placementRevealPhase === "analyzing"
                        ? L("결과 분석 중", "Analyzing")
                        : L("점수 집계 중", "Counting Score")}
                    </div>
                  )}

                  <div className="placementRevealScorePanel">
                    <div className="placementRevealScoreLabel">{L("배치 점수", "Placement Rating")}</div>
                    <div className={`placementRevealScore ${placementRevealPhase === "counting" ? "counting" : ""}`}>
                      R {placementRevealRating}
                    </div>
                  </div>

                  {placementRevealPhase !== "reveal" && (
                    <div className="placementRevealAnalyzePanel">
                      <div className="placementRevealStatusRow">
                        <span>{L("단계 데이터", "Stage Data")}</span>
                        <strong>{placementResultCard.solvedSequential}/{PLACEMENT_STAGES.length}</strong>
                      </div>
                      <div className="placementRevealStatusRow">
                        <span>{L("기록 정렬", "Time Sync")}</span>
                        <strong>{placementResultElapsedText}</strong>
                      </div>
                      <div className="placementRevealAnalyzing">
                        <span />
                      </div>
                    </div>
                  )}

                  <motion.div
                    className={`placementRevealTierWrap ${placementRevealPhase === "reveal" ? "show" : ""}`}
                    initial={false}
                    animate={{
                      opacity: placementRevealPhase === "reveal" ? 1 : 0,
                      scale: placementRevealPhase === "reveal" ? 1 : 0.82,
                      y: placementRevealPhase === "reveal" ? 0 : 16,
                    }}
                    transition={{ type: "spring", stiffness: 190, damping: 18, mass: 0.84 }}
                  >
                    <span className="placementRevealImpactRing primary" />
                    <span className="placementRevealImpactRing secondary" />
                    <span className="placementRevealTierHalo" />
                    <div className="placementRevealTierMedia">
                      <img
                        src={TIER_IMAGE_MAP[placementResultCard.tier.key] || TIER_IMAGE_MAP.bronze}
                        alt={placementResultCard.tier.labelEn}
                      />
                    </div>
                    <div className="placementRevealTierStamp">{L("배치 확정", "ASSIGNED")}</div>
                  </motion.div>
                  {placementRevealPhase === "reveal" && (
                    <>
                      <div className="placementRevealTierName">{placementResultTierLabel}</div>
                      <div className="placementRevealActions">
                        <button
                          className="singleHomeBtn placementRevealClose placementRevealCloseSecondary"
                          onClick={() => {
                            setPlacementRevealOpen(false);
                            resetPlacementTest();
                            void backToMenu();
                          }}
                        >
                          HOME
                        </button>
                        <button
                          className="singleActionBtn placementRevealClose placementRevealClosePrimary"
                          onClick={() => {
                            setPlacementRevealOpen(false);
                            goPvpMode();
                          }}
                        >
                          {L("랭크전 시작", "Start Ranked")}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </section>
        )}

        {isModeAuth && (
          <div className="authScreen">
            <div className="authTabs">
              <button
                className={authTab === "login" ? "active" : ""}
                onClick={() => {
                  setAuthTab("login");
                  setLoginError("");
                  setLoginFieldErrors({ username: "", password: "" });
                  setSignupPolicyModal("");
                }}
              >
                {L("로그인", "Login")}
              </button>
              <button
                className={authTab === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthTab("signup");
                  setSignupError("");
                  setSignupFieldErrors({ username: "", nickname: "", password: "", terms: "", privacy: "" });
                }}
              >
                {L("회원가입", "Sign Up")}
              </button>
              <button onClick={backToMenu}>{L("메인으로", "Home")}</button>
            </div>

            {authTab === "login" && (
              <form
                className="authCard"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isLoading || !loginUsername.trim() || !loginPassword) return;
                  login();
                }}
              >
                <label>
                  {L("아이디", "Username")}
                  <input
                    type="text"
                    className={loginFieldErrors.username ? "fieldError" : ""}
                    value={loginUsername}
                    onChange={(e) => {
                      setLoginUsername(e.target.value);
                      setLoginFieldErrors((prev) => ({ ...prev, username: "" }));
                      if (loginError) setLoginError("");
                    }}
                    placeholder={L("아이디", "Username")}
                  />
                  {loginFieldErrors.username && <span className="fieldErrorText">{loginFieldErrors.username}</span>}
                </label>
                <label>
                  {L("비밀번호", "Password")}
                  <input
                    type="password"
                    className={loginFieldErrors.password ? "fieldError" : ""}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginFieldErrors((prev) => ({ ...prev, password: "" }));
                      if (loginError) setLoginError("");
                    }}
                    placeholder={L("비밀번호", "Password")}
                  />
                  {loginFieldErrors.password && <span className="fieldErrorText">{loginFieldErrors.password}</span>}
                </label>
                {loginError && <div className="modalError">{loginError}</div>}
                <div className="modalActions">
                  <button type="button" onClick={backToMenu}>{L("취소", "Cancel")}</button>
                  <button type="submit" disabled={isLoading || !loginUsername.trim() || !loginPassword}>
                    {isLoading ? L("로그인 중...", "Logging in...") : L("로그인", "Login")}
                  </button>
                </div>
              </form>
            )}

            {authTab === "signup" && (
              <div className="authCard">
                <label>
                  {L("아이디", "Username")}
                  <input
                    type="text"
                    className={signupFieldErrors.username ? "fieldError" : ""}
                    value={signupUsername}
                    onChange={(e) => {
                      setSignupUsername(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, username: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder={L("아이디(3~24자)", "Username (3-24 chars)")}
                  />
                  {signupFieldErrors.username && (
                    <span className="fieldErrorText">{signupFieldErrors.username}</span>
                  )}
                </label>
                <label>
                  {L("닉네임", "Nickname")}
                  <input
                    type="text"
                    className={signupFieldErrors.nickname ? "fieldError" : ""}
                    value={signupNickname}
                    onChange={(e) => {
                      setSignupNickname(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, nickname: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder={L("닉네임", "Nickname")}
                  />
                  {signupFieldErrors.nickname && (
                    <span className="fieldErrorText">{signupFieldErrors.nickname}</span>
                  )}
                </label>
                <label>
                  {L("비밀번호", "Password")}
                  <input
                    type="password"
                    className={signupFieldErrors.password ? "fieldError" : ""}
                    value={signupPassword}
                    onChange={(e) => {
                      setSignupPassword(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, password: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder={L("영문+숫자 포함 8자 이상", "At least 8 chars with letters and numbers")}
                  />
                  {signupFieldErrors.password && (
                    <span className="fieldErrorText">{signupFieldErrors.password}</span>
                  )}
                </label>
                <div className="signupAgreements">
                  <label className={`agreementRow ${signupFieldErrors.terms ? "error" : ""}`}>
                    <input
                      type="checkbox"
                      checked={signupAgreeTerms}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSignupAgreeTerms(checked);
                        setSignupFieldErrors((prev) => ({ ...prev, terms: "" }));
                        if (signupError && checked && signupAgreePrivacy) setSignupError("");
                      }}
                    />
                    <span>{L("[필수] 이용약관 동의", "[Required] Agree to Terms of Service")}</span>
                    <button
                      type="button"
                      className="agreementLinkBtn"
                      onClick={() => setSignupPolicyModal("terms")}
                    >
                      {L("보기", "View")}
                    </button>
                  </label>
                  {signupFieldErrors.terms && <span className="fieldErrorText">{signupFieldErrors.terms}</span>}

                  <label className={`agreementRow ${signupFieldErrors.privacy ? "error" : ""}`}>
                    <input
                      type="checkbox"
                      checked={signupAgreePrivacy}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSignupAgreePrivacy(checked);
                        setSignupFieldErrors((prev) => ({ ...prev, privacy: "" }));
                        if (signupError && checked && signupAgreeTerms) setSignupError("");
                      }}
                    />
                    <span>{L("[필수] 개인정보처리방침 동의", "[Required] Agree to Privacy Policy")}</span>
                    <button
                      type="button"
                      className="agreementLinkBtn"
                      onClick={() => setSignupPolicyModal("privacy")}
                    >
                      {L("보기", "View")}
                    </button>
                  </label>
                  {signupFieldErrors.privacy && <span className="fieldErrorText">{signupFieldErrors.privacy}</span>}
                </div>
                {signupError && <div className="modalError">{signupError}</div>}
                <div className="modalActions">
                  <button onClick={backToMenu}>{L("취소", "Cancel")}</button>
                  <button
                    onClick={signup}
                    disabled={
                      isLoading ||
                      !signupUsername.trim() ||
                      !signupNickname.trim() ||
                      !signupPassword ||
                      !signupAgreeTerms ||
                      !signupAgreePrivacy
                    }
                  >
                    {isLoading ? L("가입 중...", "Signing up...") : L("회원가입", "Sign Up")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isModeAuth && signupPolicyModal && (
          <div className="modalBackdrop" onClick={() => setSignupPolicyModal("")}>
            <div className="modalCard policyModal" onClick={(e) => e.stopPropagation()}>
              <h2>
                {signupPolicyModal === "terms"
                  ? L("이용약관", "Terms of Service")
                  : L("개인정보처리방침", "Privacy Policy")}
              </h2>
              <div className="policyBody">
                {signupPolicyModal === "terms" ? (
                  <>
                    <h3>{L("1. 서비스 이용", "1. Service Use")}</h3>
                    <p>
                      {L(
                        "본 서비스는 노노그램 게임 이용을 위한 서비스이며, 관련 법령과 운영 정책을 준수해야 합니다.",
                        "This service provides nonogram gameplay and must be used in compliance with laws and service rules."
                      )}
                    </p>
                    <h3>{L("2. 계정", "2. Account")}</h3>
                    <p>
                      {L(
                        "회원은 본인 계정 정보를 안전하게 관리해야 하며, 타인 명의 도용이나 비정상 이용은 제한될 수 있습니다.",
                        "Users must keep account credentials secure. Impersonation or abusive use may be restricted."
                      )}
                    </p>
                    <h3>{L("3. 제재", "3. Restrictions")}</h3>
                    <p>
                      {L(
                        "서비스 운영을 방해하거나 치팅, 욕설, 불법 행위가 확인될 경우 이용이 제한될 수 있습니다.",
                        "Use may be limited for cheating, abuse, illegal actions, or disruption of service operations."
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <h3>{L("1. 수집 항목", "1. Data Collected")}</h3>
                    <p>
                      {L(
                        "회원가입 시 아이디, 닉네임, 비밀번호(해시 처리)를 수집하며, 경기 기록이 저장될 수 있습니다.",
                        "At sign-up, username, nickname, and hashed password are collected. Match records may be stored."
                      )}
                    </p>
                    <h3>{L("2. 이용 목적", "2. Purpose of Use")}</h3>
                    <p>
                      {L(
                        "회원 인증, 멀티플레이 매칭, 랭킹 제공, 서비스 안정화 및 부정 이용 방지 목적으로 이용됩니다.",
                        "Data is used for authentication, multiplayer matchmaking, ranking, service stability, and abuse prevention."
                      )}
                    </p>
                    <h3>{L("3. 보관 및 보호", "3. Retention & Security")}</h3>
                    <p>
                      {L(
                        "관련 법령 또는 서비스 운영에 필요한 기간 동안 보관하며, 안전한 방식으로 보호합니다.",
                        "Data is retained as required by law or service operation and protected with appropriate safeguards."
                      )}
                    </p>
                  </>
                )}
              </div>
              <div className="modalActions">
                <button onClick={() => setSignupPolicyModal("")}>{L("닫기", "Close")}</button>
              </div>
            </div>
          </div>
        )}

        {(isModeRanking || isModeLegacyRanking) && (
          <section className="rankingScreen">
            <div className="rankingTopBar">
              <div className="rankingTitleBlock">
                <div className="rankingTitle">
                  <Trophy size={18} /> {isModeLegacyRanking ? L("이전 레이팅 랭킹", "Legacy Rating Ranking") : L("PvP 랭킹", "PvP Ranking")}
                </div>
                {isLoggedIn && (
                  <div className="rankingMeBadge">
                    {myRatingRank
                      ? isModeLegacyRanking
                        ? L(
                            `내 순위 ${myRatingRank}등${ratingTotalUsers > 0 ? ` / ${ratingTotalUsers}` : ""}`,
                            `My Rank #${myRatingRank}${ratingTotalUsers > 0 ? ` / ${ratingTotalUsers}` : ""}`
                          )
                        : L(
                            `내 순위 ${myRatingRank}등${ratingTotalUsers > 0 ? ` / ${ratingTotalUsers}` : ""} · ${myTierInfo?.labelKo || "브론즈"}`,
                            `My Rank #${myRatingRank}${ratingTotalUsers > 0 ? ` / ${ratingTotalUsers}` : ""} · ${myTierInfo?.labelEn || "Bronze"}`
                          )
                      : L("내 순위: 집계 중", "My Rank: calculating")}
                  </div>
                )}
              </div>
              <div className="rankingActions">
                <button
                  className="singleActionBtn"
                  onClick={() => void fetchRatingUsers(isModeLegacyRanking ? "legacy" : "current")}
                  disabled={ratingLoading}
                >
                  {ratingLoading ? "LOADING..." : "REFRESH"}
                </button>
                <button className="singleSfxBtn replayOpenBtn" onClick={goReplayHallMode} disabled={replayLoading}>
                  {replayLoading ? L("로딩 중...", "Loading...") : L("명예의 전당", "HALL OF FAME")}
                </button>
                <button className="singleHomeBtn" onClick={backToMenu}>
                  HOME
                </button>
              </div>
            </div>
            <div className="rankingTableWrap">
              <table className="rankingTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{L("닉네임", "Nickname")}</th>
                    <th>{L("티어", "Tier")}</th>
                    <th>{isModeLegacyRanking ? L("레이팅", "Rating") : L("점수", "Score")}</th>
                    {isModeLegacyRanking && <th>{L("전적", "Record")}</th>}
                    {isModeLegacyRanking && <th>{L("승률", "Win Rate")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {ratingUsers.length === 0 ? (
                    <tr>
                      <td colSpan={isModeLegacyRanking ? 6 : 4} className="rankingEmpty">
                        {ratingLoading ? L("불러오는 중...", "Loading...") : L("표시할 유저가 없습니다.", "No users to display.")}
                      </td>
                    </tr>
                  ) : (
                    ratingUsers.map((u, idx) => {
                      const games = Number(u.rating_games || 0);
                      const wins = Number(u.rating_wins || 0);
                      const losses = Number(u.rating_losses || 0);
                      const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
                      const tierInfo = getTierInfoByRating(u.rating, idx + 1);
                      return (
                        <tr key={u.id}>
                          <td>{idx + 1}</td>
                          <td>{u.nickname}</td>
                          <td>
                            <span className={`tierBadge tier-${tierInfo.key}`}>
                              {lang === "ko" ? tierInfo.labelKo : tierInfo.labelEn}
                            </span>
                          </td>
                          <td className="ratingScore">{Number.isFinite(Number(u?.rating)) ? Number(u.rating) : 0}</td>
                          {isModeLegacyRanking && (
                            <td>
                              {wins}W {losses}L ({games})
                            </td>
                          )}
                          {isModeLegacyRanking && <td>{winRate}%</td>}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isModeReplayHall && (
          <section className="hallScreen">
            <div className="hallHero">
              <div className="hallHeroGlint" />
              <div className="hallHeroTop">
                <div className="hallHeroTag">HALL OF FAME</div>
              </div>
              <h2>{L("사이즈별 최고 기록", "Best Records By Size")}</h2>
              <p>
                {L(
                  "각 퍼즐 유형의 TOP 3 기록만 집계됩니다.",
                  "Only Top 3 records are tracked for each puzzle size."
                )}
              </p>
            </div>

            {replayError && <div className="replayError hallError">{replayError}</div>}

            <div className="hallActions">
              <button className="singleActionBtn" onClick={fetchBestReplayRecords} disabled={replayLoading}>
                {replayLoading ? L("새로고침 중...", "Refreshing...") : L("기록 새로고침", "Refresh Records")}
              </button>
              <button className="singleSfxBtn" onClick={goRankingMode}>
                {L("랭킹으로", "Go Ranking")}
              </button>
              <button className="singleHomeBtn" onClick={backToMenu}>
                HOME
              </button>
            </div>

            <div className="hallTabs" role="tablist" aria-label={L("퍼즐 유형 탭", "Puzzle size tabs")}>
              {hallSizes.map((size) => (
                <button
                  key={`hall-tab-${size.sizeKey}`}
                  className={`hallTab ${hallActiveSizeKey === size.sizeKey ? "active" : ""}`}
                  onClick={() => setHallActiveSizeKey(size.sizeKey)}
                  role="tab"
                  aria-selected={hallActiveSizeKey === size.sizeKey}
                >
                  <span>{size.sizeKey}</span>
                  <small>TOP {Math.min(3, size.records.length)}</small>
                </button>
              ))}
            </div>

            <div className="hallTableWrap">
              <table className="hallTable">
                <thead>
                  <tr>
                    <th>{L("순위", "Rank")}</th>
                    <th>{L("플레이어 이름", "Player")}</th>
                    <th>{L("풀이 시간", "Solve Time")}</th>
                    <th>{L("해결 날짜", "Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {hallActiveRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="hallTableEmpty">
                        {replayLoading
                          ? L("불러오는 중...", "Loading...")
                          : L("이 유형에는 아직 기록이 없습니다.", "No records for this size yet.")}
                      </td>
                    </tr>
                ) : (
                  hallActiveRecords.map((record, idx) => {
                    const rank = Number(record.rank || idx + 1);
                    const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "plain";
                    return (
                        <tr key={`hall-row-${record.recordId}`} className="hallTableRow">
                          <td className="hallRankCell">
                            <span className={`hallMedal ${medalClass}`}>{formatRankLabel(rank)}</span>
                          </td>
                          <td>{record.nickname || "-"}</td>
                          <td>{formatHallElapsedMs(record.elapsedMs, record.elapsedSec)}</td>
                          <td>{formatKstDate(record.finishedAtMs)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {hallStreakTop.length > 0 && (
              <div className="hallStreakWrap">
                <div className="hallStreakTitle">{L("최대 연승 TOP 3", "Best Win Streak TOP 3")}</div>
                <table className="hallStreakTable">
                  <thead>
                    <tr>
                      <th>{L("순위", "Rank")}</th>
                      <th>{L("플레이어 이름", "Player")}</th>
                      <th>{L("최대 연승", "Best Streak")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hallStreakTop.map((row, idx) => {
                      const rank = Number(row.rank || idx + 1);
                      const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "plain";
                      return (
                        <tr key={`hall-streak-${row.userId || idx}`}>
                          <td className="hallRankCell">
                            <span className={`hallMedal ${medalClass}`}>{formatRankLabel(rank)}</span>
                          </td>
                          <td>{row.nickname || "-"}</td>
                          <td className="hallStreakValue">{Number(row.winStreakBest)} {L("연승", "wins")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {isModeSingle && (
          <div className="controls singleTopControls" data-tutorial="single-controls">
            {!isInRaceRoom && (
              <>
                <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                  <option value="5x5">5x5</option>
                  <option value="10x10">10x10</option>
                  <option value="15x15">15x15</option>
                  <option value="20x20">20x20</option>
                  <option value="25x25">25x25</option>
                </select>
                <button className="singleActionBtn" onClick={loadRandomBySize} disabled={isLoading}>
                  {isLoading ? "LOADING..." : "RANDOM LOAD"}
                </button>
              </>
            )}
            <button className="singleHomeBtn" onClick={backToMenu} disabled={isInRaceRoom}>
              HOME
            </button>
          </div>
        )}

        {isModeTutorial && (
          <section className="tutorialStage">
            <div className="tutorialCoachBar">
              <div className="tutorialCoachProgress">
                <span className={`tutorialCoachBadge ${tutorialAllDone ? "done" : ""}`}>
                  {tutorialAllDone
                    ? "CLEAR"
                    : `${Math.min(tutorialCurrentTaskIndex + 1, TUTORIAL_GUIDE_STEPS.length)}/${TUTORIAL_GUIDE_STEPS.length}`}
                </span>
                <div className="tutorialCoachDots">
                  {TUTORIAL_GUIDE_STEPS.map((step, idx) => (
                    <span
                      key={step.key}
                      className={`tutorialCoachDot ${idx < tutorialCurrentTaskIndex ? "done" : ""} ${
                        idx === tutorialCurrentTaskIndex ? "active" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className={`tutorialCoachPrompt ${tutorialAllDone ? "done" : ""}`}>
                {tutorialCurrentPrompt}
              </div>
              <div className="tutorialStageActions">
                <button onClick={startTutorialMode}>{L("다시 시작", "Restart")}</button>
                <button onClick={skipTutorial}>{L("건너뛰기", "Skip")}</button>
                <button onClick={backToMenu}>{L("종료", "Exit")}</button>
              </div>
            </div>
          </section>
        )}

        {isModePvp && (
          <>
            {!isLoggedIn && (
              <div className="raceStateBox">
                <div>{L("오른쪽 상단에서 로그인 후 PvP 매칭을 이용하세요.", "Log in from the top-right to use PvP matchmaking.")}</div>
              </div>
            )}
            {isLoggedIn && !isInRaceRoom && (
              <section className="pvpQueuePanel">
                <div className="pvpQueueTitle">RANKED PVP MATCH</div>
                <div className="pvpQueueDescRow">
                  <div className="pvpQueueDesc">
                    {L(
                      "실버 티어까지는 5x5·10x10·15x15, 골드 티어부터는 10x10·15x15·20x20·25x25 퍼즐이 등장합니다.",
                      "Up to Silver tier, 5x5/10x10/15x15 puzzles appear. From Gold tier, 10x10/15x15/20x20/25x25 puzzles appear."
                    )}
                  </div>
                  <button
                    type="button"
                    className="pvpTierGuideTrigger"
                    onClick={() => setShowPvpTierGuideModal(true)}
                    aria-label={L("티어 안내 보기", "Open tier guide")}
                    title={L("티어 안내", "Tier guide")}
                  >
                    <span className="pvpTierGuideTriggerGlyph">i</span>
                  </button>
                </div>
                <div className="pvpQueueState">
                  {pvpServerState === "matching" && pvpMatchState === "accept" && L("수락 확인 단계", "Acceptance check")}
                  {pvpServerState === "matching" && pvpMatchState === "ban" && L("퍼즐 밴 단계", "Puzzle ban phase")}
                  {pvpServerState === "matching" && pvpMatchState === "reveal" && L("최종 퍼즐 추첨 중", "Final puzzle roulette")}
                  {pvpServerState === "matching" && !pvpMatchState && L("상대 탐색 중", "Searching opponent")}
                  {pvpServerState === "waiting" && L(`매칭 중... 대기열 ${pvpQueueSize}명`, `Matching... queue ${pvpQueueSize}`)}
                  {pvpServerState === "cancelled" && L("매칭 취소됨", "Match cancelled")}
                  {pvpServerState === "idle" && L("대기 중", "Idle")}
                </div>

                {isPvpShowdownActive && (
                  <div className="pvpShowdownCard">
                    <div className="pvpShowdownPlayer left">
                      <span className="pvpShowdownName">{pvpShowdownPlayers[0]?.nickname || "Player A"}</span>
                      <span className="pvpShowdownStat">
                        {Number.isFinite(Number(pvpShowdownPlayers[0]?.rating))
                          ? `R ${Math.round(Number(pvpShowdownPlayers[0]?.rating))}`
                          : "R -"}
                      </span>
                      <span className="pvpShowdownStat">
                        {(() => {
                          const rank =
                            Number.isInteger(Number(pvpShowdownPlayers[0]?.ratingRank)) &&
                            Number(pvpShowdownPlayers[0]?.ratingRank) > 0
                              ? Number(pvpShowdownPlayers[0]?.ratingRank)
                              : null;
                          return rank ? L(`${rank}등`, `Rank #${rank}`) : L("등수 미집계", "Unranked");
                        })()}
                      </span>
                      <span className="pvpShowdownStat">
                        {(() => {
                          const t = getTierInfoByRating(pvpShowdownPlayers[0]?.rating, pvpShowdownPlayers[0]?.ratingRank);
                          return lang === "ko" ? t.labelKo : t.labelEn;
                        })()}
                      </span>
                    </div>
                    <div className="pvpShowdownVs">VS</div>
                    <div className="pvpShowdownPlayer right">
                      <span className="pvpShowdownName">{pvpShowdownPlayers[1]?.nickname || "Player B"}</span>
                      <span className="pvpShowdownStat">
                        {Number.isFinite(Number(pvpShowdownPlayers[1]?.rating))
                          ? `R ${Math.round(Number(pvpShowdownPlayers[1]?.rating))}`
                          : "R -"}
                      </span>
                      <span className="pvpShowdownStat">
                        {(() => {
                          const rank =
                            Number.isInteger(Number(pvpShowdownPlayers[1]?.ratingRank)) &&
                            Number(pvpShowdownPlayers[1]?.ratingRank) > 0
                              ? Number(pvpShowdownPlayers[1]?.ratingRank)
                              : null;
                          return rank ? L(`${rank}등`, `Rank #${rank}`) : L("등수 미집계", "Unranked");
                        })()}
                      </span>
                      <span className="pvpShowdownStat">
                        {(() => {
                          const t = getTierInfoByRating(pvpShowdownPlayers[1]?.rating, pvpShowdownPlayers[1]?.ratingRank);
                          return lang === "ko" ? t.labelKo : t.labelEn;
                        })()}
                      </span>
                    </div>
                  </div>
                )}

                {!isPvpShowdownActive && pvpMatchState === "accept" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">{L("수락을 눌러야 게임이 시작됩니다", "Press accept to start the game")}</div>
                    <div className="pvpGaugeWrap">
                      <div className="pvpGaugeFill" style={{ width: `${pvpAcceptPercent}%` }} />
                    </div>
                    <div className="pvpDeadlineText">{(pvpAcceptLeftMs / 1000).toFixed(1)}s</div>
                    <div className="pvpAcceptPlayers">
                      {(pvpMatch?.players || []).map((p) => {
                        return (
                          <div key={p.userId} className={`pvpAcceptPlayer ${p.accepted ? "accepted" : ""}`}>
                            <span>{p.nickname}</span>
                            <span>{p.accepted ? L("수락 완료", "Accepted") : L("대기 중", "Waiting")}</span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="singleActionBtn"
                      onClick={acceptPvpMatch}
                      disabled={pvpAcceptBusy || pvpMatch?.me?.accepted === true}
                    >
                      {pvpMatch?.me?.accepted ? "ACCEPTED" : pvpAcceptBusy ? L("처리중...", "Processing...") : "ACCEPT MATCH"}
                    </button>
                  </div>
                )}

                {!isPvpShowdownActive && pvpMatchState === "ban" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">
                      {L(
                        `${pvpDisplayOptions.length}개 유형 중 1개를 밴하거나 스킵하세요`,
                        `Ban one of ${pvpDisplayOptions.length} available types, or skip`
                      )}
                    </div>
                    <div className="pvpGaugeWrap ban">
                      <div className="pvpGaugeFill" style={{ width: `${pvpBanPercent}%` }} />
                    </div>
                    <div className="pvpDeadlineText">{(pvpBanLeftMs / 1000).toFixed(1)}s</div>
                    <div
                      className={`pvpBanGrid count-${Math.max(1, pvpDisplayOptions.length)}`}
                      style={{ "--pvp-option-count": Math.max(1, pvpDisplayOptions.length) }}
                    >
                      {pvpDisplayOptions.map((option) => {
                        const sizeKey = option.sizeKey || `${option.width}x${option.height}`;
                        const bannedBy = Array.isArray(option.bannedByNicknames) ? option.bannedByNicknames : [];
                        const bannedLabel = bannedBy.length ? bannedBy.join(", ") : "";
                        const isBanned = bannedBy.length > 0 || option.banned;
                        const isMine = pvpMatch?.me?.bannedSizeKey === sizeKey;
                        return (
                          <button
                            key={sizeKey}
                            className={`pvpBanCard ${isBanned ? "banned" : ""} ${isMine ? "mine" : ""}`}
                            onClick={() => submitPvpBan(sizeKey)}
                            disabled={pvpBanBusy || pvpMatch?.me?.banSubmitted === true}
                          >
                            <span className="pvpBanSize">{sizeKey}</span>
                            {isBanned && <span className="pvpBanMark">X</span>}
                            {bannedLabel && <span className="pvpBanMeta">{bannedLabel}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="singleHomeBtn"
                      onClick={() => submitPvpBan("")}
                      disabled={pvpBanBusy || pvpMatch?.me?.banSubmitted === true}
                    >
                      {pvpMatch?.me?.banSubmitted ? L("제출 완료", "Submitted") : "SKIP BAN"}
                    </button>
                  </div>
                )}

                {!isPvpShowdownActive && pvpMatchState === "reveal" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">{L("밴 제외 유형 중 랜덤 추첨", "Random draw among unbanned types")}</div>
                    <div
                      className={`pvpRevealTrack count-${Math.max(1, pvpDisplayOptions.length)}`}
                      style={{ "--pvp-option-count": Math.max(1, pvpDisplayOptions.length) }}
                    >
                      {pvpDisplayOptions.map((option, idx) => {
                        const sizeKey = option.sizeKey || `${option.width}x${option.height}`;
                        const bannedBy = Array.isArray(option.bannedByNicknames) ? option.bannedByNicknames : [];
                        const isBanned = bannedBy.length > 0 || option.banned;
                        const isActive = idx === pvpRevealIndex;
                        const isChosen = !isPvpRevealSpinning && pvpMatch?.chosenSizeKey === sizeKey;
                        return (
                          <div
                            key={`reveal-${sizeKey}`}
                            className={`pvpRevealItem ${isActive ? "active" : ""} ${isBanned ? "banned" : ""} ${
                              isChosen ? "chosen" : ""
                            }`}
                          >
                            <span>{sizeKey}</span>
                            {isBanned && <span className="pvpRevealBan">X {bannedBy.join(", ")}</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="pvpRevealResult">
                      {!isPvpRevealSpinning && pvpMatch?.chosenSizeKey
                        ? L(`선택됨: ${pvpMatch.chosenSizeKey}`, `Selected: ${pvpMatch.chosenSizeKey}`)
                        : L("결정 중...", "Deciding...")}
                    </div>
                  </div>
                )}

                {pvpServerState === "cancelled" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">
                      {pvpCancelReasonText(String(pvpMatch?.cancelReason || ""))}
                    </div>
                  </div>
                )}

                <div className="pvpQueueActions">
                  <button className="singleActionBtn" onClick={joinPvpQueue} disabled={isLoading || pvpSearching}>
                    {isLoading ? "MATCHING..." : pvpSearching ? "SEARCHING..." : "FIND OPPONENT"}
                  </button>
                  <button className="singleHomeBtn" onClick={() => cancelPvpQueue()} disabled={!pvpSearching || isPvpCancelHomeLocked || isPvpShowdownActive}>
                    CANCEL
                  </button>
                  <button className="singleSfxBtn" onClick={backToMenu} disabled={isPvpCancelHomeLocked || isPvpShowdownActive}>
                    HOME
                  </button>
                </div>
              </section>
            )}
            {isLoggedIn && isInRaceRoom && (
              <div className="racePanel">
                <button onClick={leaveRace} disabled={!raceRoomCode}>
                  Leave Match
                </button>
              </div>
            )}
          </>
        )}

        {isModeMulti && (
          <>
            {!isInRaceRoom && (
              <div className="multiLobbyShell">
                <div className="lobbyQuick">
                  <button className="lobbyQuickBtn" onClick={backToMenu}>
                    <Home size={18} /> {L("메인", "HOME")}
                  </button>
                </div>
                <div className="lobbyActions" data-tutorial="lobby-actions">
                  <button
                    className="lobbyCardBtn create"
                    onClick={() => {
                      setCreateRoomTitle("");
                      setCreateSize(selectedSize);
                      setCreateMaxPlayers("2");
                      setCreateVisibility("public");
                      setCreatePassword("");
                      setShowCreateModal(true);
                    }}
                    disabled={isLoading}
                  >
                    {L("방 만들기", "CREATE ROOM")}
                  </button>

                  <div className="lobbyCardBtn join">
                    <div className="lobbyJoinTitle">{L("방 참가", "JOIN ROOM")}</div>
                    <div className="lobbyJoinRow">
                      <input
                        type="text"
                        value={joinRoomCode}
                        onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                        placeholder={L("방 코드를 입력하세요", "Enter room code")}
                      />
                      <button
                        onClick={() => {
                          setJoinRoomType("unknown");
                          setJoinPassword("");
                          setJoinModalSource("manual");
                          setShowJoinModal(true);
                        }}
                        disabled={!joinRoomCode.trim()}
                      >
                        {L("참가", "JOIN")}
                      </button>
                    </div>
                  </div>

                  <button className="lobbyCardBtn refresh" onClick={fetchPublicRooms} disabled={roomsLoading}>
                    {roomsLoading ? L("새로고침 중...", "REFRESHING...") : L("목록 새로고침", "REFRESH LIST")}
                  </button>
                </div>
              </div>
            )}

            {!isLoggedIn && (
              <div className="raceStateBox">
                <div>{L("오른쪽 상단에서 로그인 후 멀티플레이를 이용하세요.", "Log in from the top-right to use multiplayer.")}</div>
              </div>
            )}

            {isLoggedIn && isInRaceRoom && (
              <div className="racePanel">
                <button onClick={leaveRace} disabled={!raceRoomCode}>
                  {L("방 나가기", "Leave Room")}
                </button>
              </div>
            )}
          </>
        )}

        {isModeMulti && isLoggedIn && !isInRaceRoom && (
          <div className="lobbyTableWrap" data-tutorial="lobby-table">
            <div className="lobbyTableTitle">{L("방 목록", "ROOM LIST")}</div>
            {publicRooms.length === 0 ? (
              <div className="lobbyEmpty">{L("입장 가능한 방이 없습니다.", "No rooms available to join.")}</div>
            ) : (
              <table className="lobbyTable">
                <thead>
                  <tr>
                    <th>{L("방 코드", "Room Code")}</th>
                    <th>{L("제목", "Title")}</th>
                    <th>{L("크기", "Size")}</th>
                    <th>{L("인원", "Players")}</th>
                    <th>{L("상태", "Status")}</th>
                    <th>{L("입장", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {publicRooms.map((room) => (
                    <tr key={room.roomCode}>
                      <td>{room.roomCode}</td>
                      <td>{room.roomTitle}</td>
                      <td>
                        {room.width}x{room.height}
                      </td>
                      <td>
                        {room.currentPlayers}/{room.maxPlayers}
                      </td>
                      <td className={room.isPrivate ? "private" : "open"}>
                        {room.isPrivate ? (
                          <span>
                            {L("비밀방", "Private")} <Lock size={14} />
                          </span>
                        ) : (
                          L("오픈방", "Open")
                        )}
                      </td>
                      <td>
                        <button
                          className="joinActionBtn"
                          onClick={async () => {
                            if (room.isPrivate) {
                              setJoinRoomCode(room.roomCode);
                              setJoinRoomType("private");
                              setJoinPassword("");
                              setJoinModalSource("list");
                              setShowJoinModal(true);
                              return;
                            }
                            await joinRaceRoomWith(room.roomCode, "");
                          }}
                        >
                          {L("참가", "Join")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {(isModeMulti || isModePvp) && isLoggedIn && raceRoomCode && shouldShowPuzzleBoard && (
          <section className="raceMatchLayout">
            <aside className="raceInfoPane">
              <div className="raceInfoTitle">
                {L("경기 상태", "Match Status")}: {racePhaseLabel}
              </div>
              <div>{L("방", "Room")}: <b>{roomTitleText || raceRoomCode}</b></div>
              <div>{L("코드", "Code")}: <b>{raceRoomCode}</b></div>
              <div>{L("인원", "Players")}: {(raceState?.players || []).length}/{raceState?.maxPlayers || 2}</div>
              {myRacePlayer && (
                <div className="raceInfoMe">
                  <span>{myRacePlayer.nickname}</span>
                </div>
              )}
              <div className="timerBar">{L("시간", "TIME")} {formattedTime}</div>
              <div className="raceActions">
                {isModeMulti && isRaceLobby && (
                  <>
                    <button onClick={() => setReady(!(myRacePlayer?.isReady === true))} disabled={!myRacePlayer}>
                      {myRacePlayer?.isReady ? L("준비 해제", "Unready") : L("준비", "Ready")}
                    </button>
                    <button onClick={startRace} disabled={raceState?.hostPlayerId !== racePlayerId || !raceState?.canStart}>
                      {L("시작 (방장)", "Start (Host)")}
                    </button>
                  </>
                )}
                {isModeMulti && isRaceFinished && (
                  <button onClick={requestRematch} disabled={isRematchLoading}>
                    {isRematchLoading ? L("준비중...", "Preparing...") : L("한판 더?", "Rematch?")}
                  </button>
                )}
              </div>
            </aside>

            <div className="raceBoardPane">
              <div
                className={`boardWrap ${isMobileBoardUi ? "mobileBoardEnabled" : ""} ${isMobileBoardUi && mobileBoardFocus ? "mobileBoardFocus" : ""}`}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div
                  className={`mobileBoardScaleShell ${isMobileBoardUi ? "active" : ""}`}
                  style={isMobileBoardUi ? { transform: `scale(${mobileBoardScale})` } : undefined}
                >
                <div className={`excelBoardScaffold ${isExcelMode ? "active" : ""}`}>
                  {isExcelMode && (
                    <div className="excelBoardHeaderRow" aria-hidden="true">
                      <div className="excelBoardHeadCorner" />
                      <div
                        className="excelBoardColLetters"
                        style={{
                          gridTemplateColumns: `repeat(${puzzle.width}, ${cellSize}px)`,
                          marginLeft: `${maxRowHintDepth * cellSize}px`,
                          width: `${puzzle.width * cellSize}px`,
                        }}
                      >
                        {excelBoardCols.map((label, idx) => (
                          <span key={`board-col-${idx}`}>{label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className={`excelBoardBodyRow ${isExcelMode ? "active" : ""}`}>
                    {isExcelMode && (
                      <div
                        className="excelBoardRowNumbers"
                        aria-hidden="true"
                        style={{
                          gridTemplateRows: `repeat(${puzzle.height}, ${cellSize}px)`,
                          marginTop: `${maxColHintDepth * cellSize}px`,
                          height: `${puzzle.height * cellSize}px`,
                        }}
                      >
                        {excelBoardRows.map((label, idx) => (
                          <span key={`board-row-${idx}`}>{label}</span>
                        ))}
                      </div>
                    )}
                    <div
                      className="nonogram"
                      style={{
                        "--cell-size": `${cellSize}px`,
                        "--left-depth": maxRowHintDepth,
                        "--top-depth": maxColHintDepth,
                        "--board-w": puzzle.width,
                        "--board-h": puzzle.height,
                      }}
                    >
                      <div className="corner" />
                      <div className="colHints" style={{ gridTemplateColumns: `repeat(${puzzle.width}, var(--cell-size))` }}>
                        {colHints.map((hint, colIdx) => (
                          <div key={`col-${colIdx}`} className="colHintCol" style={{ gridTemplateRows: `repeat(${maxColHintDepth}, var(--cell-size))` }}>
                            {Array.from({ length: maxColHintDepth }).map((_, depthIdx) => {
                              const value = hint[hint.length - maxColHintDepth + depthIdx];
                              const hintId = `c-${colIdx}-${depthIdx}`;
                              const solvedByHint = solvedCols.has(colIdx) && value != null;
                              return (
                                <button
                                  key={hintId}
                                  type="button"
                                  className={`hintNum ${activeHints.has(hintId) ? "active" : ""} ${solvedByHint ? "solved" : ""}`}
                                  onClick={() => toggleHint(hintId)}
                                >
                                  {value ?? ""}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      <div className="rowHints" style={{ gridTemplateRows: `repeat(${puzzle.height}, var(--cell-size))` }}>
                        {rowHints.map((hint, rowIdx) => (
                          <div
                            key={`row-${rowIdx}`}
                            className={`rowHintRow ${tutorialHighlightRows.includes(rowIdx) ? "tutorialHintPulse" : ""}`}
                            style={{ gridTemplateColumns: `repeat(${maxRowHintDepth}, var(--cell-size))` }}
                          >
                            {Array.from({ length: maxRowHintDepth }).map((_, depthIdx) => {
                              const value = hint[hint.length - maxRowHintDepth + depthIdx];
                              const hintId = `r-${rowIdx}-${depthIdx}`;
                              const solvedByHint = solvedRows.has(rowIdx) && value != null;
                              return (
                                <button
                                  key={hintId}
                                  type="button"
                                  className={`hintNum ${activeHints.has(hintId) ? "active" : ""} ${solvedByHint ? "solved" : ""}`}
                                  onClick={() => toggleHint(hintId)}
                                >
                                  {value ?? ""}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      <div
                        ref={boardRef}
                        className="board"
                        style={{
                          width: `${puzzle.width * cellSize}px`,
                          height: `${puzzle.height * cellSize}px`,
                          cursor: canInteractBoard ? "crosshair" : "not-allowed",
                        }}
                        onPointerDown={onBoardPointerDown}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <canvas ref={canvasRef} className="boardCanvas" />
                        {isRaceFinished && !isModePvp && <div className="countdownOverlay result">{raceResultText}</div>}
                        {showInactivityWarning && (
                          <div className={`idleDangerOverlay ${inactivityLeftSec <= 3 ? "critical" : inactivityLeftSec <= 6 ? "hot" : ""}`}>
                            <div className="idleDangerHead">
                              <span>{L("위험", "DANGER")}</span>
                              <b>{inactivityLeftSec}s</b>
                            </div>
                            <div className="idleDangerText">
                              {L("입력이 없으면 자동 패배", "No input will cause auto-defeat")}
                            </div>
                            <div className="idleDangerBar">
                              <span style={{ width: `${inactivityWarnPercent}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                {isRacePreStartMasked && (
                  <div className="racePuzzleMask">
                    {isRaceCountdown ? (
                      <span className="racePuzzleMaskCount">{countdownLeft ?? 0}</span>
                    ) : (
                      <span className="racePuzzleMaskWait">{L("READY 대기", "Waiting for READY")}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="singleTools">
                <button className="toolBtn toolUndo" onClick={undo} disabled={!canUndo || !canInteractBoard}>{L("되돌리기", "UNDO")}</button>
                <button className="toolBtn toolRedo" onClick={redo} disabled={!canRedo || !canInteractBoard}>{L("다시하기", "REDO")}</button>
                <button className="toolBtn toolClear" onClick={resetGrid} disabled={!canInteractBoard}>{L("초기화", "CLEAR")}</button>
              </div>
            </div>

            <aside className="raceSidePane">
              <div className="raceSidePlayers">
                {(raceState?.players || [])
                  .filter((p) => p.playerId !== racePlayerId)
                  .map((p) => {
                  const percent = raceState?.totalAnswerCells
                    ? Math.round(((p.correctAnswerCells || 0) / raceState.totalAnswerCells) * 100)
                    : 0;
                  const canOpenProfile = canOpenUserProfile(p?.userId);
                  return (
                    canOpenProfile ? (
                      <button
                        key={p.playerId}
                        type="button"
                        className="raceProgressRow raceProgressRowButton clickable"
                        onClick={() => handleOpenUserProfile(p.userId, p)}
                      >
                        <span className="raceProgressIdentity">
                          <ProfileAvatar avatarKey={getDisplayedRaceProfileAvatarKey(p)} nickname={p.nickname} size="sm" />
                          <span>{p.nickname}</span>
                        </span>
                        <span>{percent}%</span>
                      </button>
                    ) : (
                      <div key={p.playerId} className="raceProgressRow">
                        <span className="raceProgressIdentity">
                          <ProfileAvatar avatarKey={getDisplayedRaceProfileAvatarKey(p)} nickname={p.nickname} size="sm" />
                          <span>{p.nickname}</span>
                        </span>
                        <span>{percent}%</span>
                      </div>
                    )
                  );
                })}
              </div>

              <div className="chatBox">
                <div className="chatTitle">{L("방 채팅", "Room Chat")}</div>
                <div className="chatBody" ref={chatBodyRef}>
                  {chatMessages.length === 0 ? (
                    <div className="chatEmpty">{L("아직 채팅이 없습니다.", "No chat yet.")}</div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div className="chatMsg" key={msg.id}>
                        {canOpenUserProfile(msg.userId) ? (
                          <button type="button" className="chatProfileBtn" onClick={() => handleOpenUserProfile(msg.userId, msg)}>
                            <b>{msg.nickname}</b>
                          </button>
                        ) : (
                          <b>{msg.nickname}</b>
                        )}
                        : {msg.text}
                      </div>
                    ))
                  )}
                </div>
                <div className="chatInputRow">
                  <div className="emojiWrap" ref={emojiWrapRef}>
                    <button type="button" onClick={() => setShowEmojiPicker((prev) => !prev)} title={L("이모지", "Emoji")}>😀</button>
                    {showEmojiPicker && (
                      <div className="emojiPopover">
                        <EmojiPicker
                          onEmojiClick={(emojiData) => {
                            setChatInput((prev) => `${prev}${emojiData.emoji}`);
                            setShowEmojiPicker(false);
                          }}
                          skinTonesDisabled
                          width={300}
                          height={340}
                        />
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={L("메시지 입력...", "Type a message...")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendRaceChat();
                      }
                    }}
                  />
                  <button onClick={sendRaceChat} disabled={chatSending || !chatInput.trim()}>
                    {chatSending ? "..." : L("전송", "Send")}
                  </button>
                </div>
              </div>
            </aside>
          </section>
        )}

        {shouldShowPuzzleBoard && !isSingleSoloMode && !isInRaceRoom && <div className="timerBar">TIME {formattedTime}</div>}
        {shouldShowPuzzleBoard && !isSingleSoloMode && !isInRaceRoom && (
          <div className="gameTools" role="toolbar" aria-label="Board tools">
            <button
              className="iconBtn"
              onClick={undo}
              disabled={!canUndo || !canInteractBoard}
              aria-label="Undo"
              title="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="iconBtn"
              onClick={redo}
              disabled={!canRedo || !canInteractBoard}
              aria-label="Redo"
              title="Redo"
            >
              <Redo2 size={16} />
            </button>
            <button
              className="iconBtn danger"
              onClick={resetGrid}
              disabled={!canInteractBoard}
              aria-label="Clear board"
              title="Clear"
            >
              <Eraser size={16} />
            </button>
          </div>
        )}
        {shouldShowPuzzleBoard && isSingleSoloMode && (
          <div className="singleBottomBar">
            <div className="singleTimer">
              {isModePlacementTest ? L("남은 시간", "Time Left") : "TIMER"}: {isModePlacementTest ? placementTimerText : formattedTime}
            </div>
            <div className="singleTools" data-tutorial="single-tools">
              <button className="toolBtn toolUndo" onClick={undo} disabled={!canUndo || !canInteractBoard}>
                UNDO
              </button>
              <button className="toolBtn toolRedo" onClick={redo} disabled={!canRedo || !canInteractBoard}>
                REDO
              </button>
              <button className="toolBtn toolClear" onClick={resetGrid} disabled={!canInteractBoard}>
                CLEAR
              </button>
            </div>
          </div>
        )}

        {status && !isModeAuth && <div className="status">{status}</div>}

        {pvpRatingFx && (
          <div className={`rankedFxOverlay ${pvpFxTierClass}`} onClick={dismissPvpRatingFx}>
            <motion.div
              className={`rankedFxCard ${pvpFxTierClass} ${pvpRatingFx.result === "loss" ? "loss" : "win"} ${
                pvpRatingFx.done ? "done" : ""
              }`}
              initial={{ opacity: 0, scale: 0.86, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 230, damping: 24, mass: 0.94 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rankedFxEyebrow">{pvpRatingFx.isTest ? L("연출 테스트", "FX Test") : "RANKED RESULT"}</div>
              <div className={`rankedFxOutcome ${pvpRatingFx.result === "loss" ? "loss" : "win"}`}>{pvpFxOutcomeLabel}</div>
              <div className="rankedFxSub">{pvpFxOutcomeSub}</div>

              <div className={`rankedFxTierStage ${pvpRatingFx.tierShift}`}>
                <span className="rankedFxBurst one" />
                <span className="rankedFxBurst two" />
                <span className="rankedFxHalo" />
                {pvpRatingFx.tierShift === "promoted" && (
                  <div className="rankedFxPromotionFx" aria-hidden="true">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span
                        key={`promo-${i}`}
                        style={{
                          "--pa": `${i * 36}deg`,
                          "--pd": `${(i % 5) * 0.06}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {pvpRatingFx.tierShift === "demoted" && (
                  <div className="rankedFxDemotionFx" aria-hidden="true">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span
                        key={`demo-${i}`}
                        style={{
                          "--dx": `${(i - 4) * 18}px`,
                          "--dd": `${i * 0.04}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                <img src={TIER_IMAGE_MAP[pvpFxTierNow?.key] || TIER_IMAGE_MAP.bronze} alt={pvpFxTierLabel || "Tier"} />
                {pvpFxShiftLabel && <div className={`rankedFxShiftTag ${pvpRatingFx.tierShift}`}>{pvpFxShiftLabel}</div>}
              </div>

              <div className="rankedFxTierName">{pvpFxTierLabel}</div>
              {pvpFxRouteChanged && (
                <div className="rankedFxTierRoute">
                  <span>{pvpFxFromTierLabel}</span>
                  <span className="arrow">→</span>
                  <span>{pvpFxToTierLabel}</span>
                </div>
              )}

              <div className="rankedFxScoreRow">
                <div className="rankedFxScoreNow">R {pvpRatingFx.ratingNow}</div>
                <div className={`rankedFxScoreDelta ${pvpRatingFx.delta >= 0 ? "plus" : "minus"}`}>{pvpFxDeltaText}</div>
              </div>

              <div className="rankedFxTrackBlock">
                <div className="rankedFxTrackRail">
                  <div className="rankedFxTrackFill" style={{ width: `${pvpFxGaugePercent}%` }} />
                  <div className="rankedFxTrackGlow" style={{ left: `${pvpFxGaugePercent}%` }} />
                </div>
                <div className="rankedFxTrackLabels">
                  <span>{pvpFxTierLabel}</span>
                  <span>{pvpFxNextTierLabel}</span>
                </div>
              </div>

              <div className="rankedFxNumbers">
                <span>{pvpRatingFx.from}</span>
                <span className="arrow">→</span>
                <span>{pvpRatingFx.to}</span>
              </div>

              <div className="rankedFxActions">
                <button type="button" className="singleHomeBtn" onClick={dismissPvpRatingFx}>
                  {L("닫기", "Close")}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isMobileBoardUi && (
          <div
            className={`mobilePaintToggle ${mobileBoardFocus ? "focusMode" : ""}`}
            role="group"
            aria-label={L("모바일 퍼즐 컨트롤", "Mobile puzzle controls")}
          >
            <button
              type="button"
              className={`paintModeBtn ${mobilePaintMode === "fill" ? "active" : ""}`}
              onClick={() => setMobilePaintMode("fill")}
            >
              {L("채우기", "Fill")}
            </button>
            <button
              type="button"
              className={`paintModeBtn ${mobilePaintMode === "mark" ? "active" : ""}`}
              onClick={() => setMobilePaintMode("mark")}
            >
              {L("X 표시", "Mark X")}
            </button>
            <button type="button" className="paintZoomBtn" onClick={() => nudgeMobileBoardScale(-0.12)} aria-label={L("축소", "Zoom out")}>
              <Minus size={16} />
            </button>
            <button type="button" className="paintScaleBtn" onClick={() => updateMobileBoardScale(1)}>
              {Math.round(mobileBoardScale * 100)}%
            </button>
            <button type="button" className="paintZoomBtn" onClick={() => nudgeMobileBoardScale(0.12)} aria-label={L("확대", "Zoom in")}>
              <Plus size={16} />
            </button>
            <button
              type="button"
              className={`paintFocusBtn ${mobileBoardFocus ? "active" : ""}`}
              onClick={() => setMobileBoardFocus((prev) => !prev)}
            >
              {mobileBoardFocus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{mobileBoardFocus ? L("닫기", "Close") : L("보드", "Board")}</span>
            </button>
          </div>
        )}

        {showMultiResultModal && isModeMulti && isInRaceRoom && isRaceFinished && (
          <div className="modalBackdrop" onClick={() => setShowMultiResultModal(false)}>
            <div className="modalCard raceResultModal" onClick={(e) => e.stopPropagation()}>
              <h2>{L("경기 기록", "Match Results")}</h2>
              <p>
                {L("참가자 결과", "Participants")}:
                {" "}
                <b>{roomTitleText || raceRoomCode}</b>
              </p>
              <div className="raceResultTableWrap">
                <table className="raceResultTable">
                  <thead>
                    <tr>
                      <th>{L("순위", "Rank")}</th>
                      <th>{L("닉네임", "Nickname")}</th>
                      <th>{L("기록", "Time")}</th>
                      <th>{L("상태", "Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceResultRows.map((row) => (
                      <tr key={`result-${row.playerId}`} className={row.isMe ? "me" : ""}>
                        <td>{Number.isInteger(row.rank) ? row.rank : "-"}</td>
                        <td>
                          {canOpenUserProfile(row.userId) ? (
                            <button type="button" className="tableLinkBtn" onClick={() => handleOpenUserProfile(row.userId, row)}>
                              {row.nickname}
                            </button>
                          ) : (
                            row.nickname
                          )}
                        </td>
                        <td>{formatRaceElapsedSec(row.elapsedSec)}</td>
                        <td>{formatRaceStatusLabel(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modalActions">
                <button onClick={() => setShowMultiResultModal(false)}>{L("확인", "OK")}</button>
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="modalBackdrop" onClick={() => setShowCreateModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>{L("방 만들기", "Create Room")}</h2>
              <label>
                {L("퍼즐 유형", "Puzzle Size")}
                <select value={createSize} onChange={(e) => setCreateSize(e.target.value)}>
                  <option value="5x5">5x5</option>
                  <option value="10x10">10x10</option>
                  <option value="15x15">15x15</option>
                  <option value="20x20">20x20</option>
                  <option value="25x25">25x25</option>
                </select>
              </label>
              <label>
                {L("최대 인원", "Max Players")}
                <select value={createMaxPlayers} onChange={(e) => setCreateMaxPlayers(e.target.value)}>
                  <option value="2">{L("2명", "2 players")}</option>
                  <option value="3">{L("3명", "3 players")}</option>
                  <option value="4">{L("4명", "4 players")}</option>
                </select>
              </label>
              <label>
                {L("방 공개 설정", "Room Visibility")}
                <select value={createVisibility} onChange={(e) => setCreateVisibility(e.target.value)}>
                  <option value="public">{L("오픈방", "Public")}</option>
                  <option value="private">{L("비밀방", "Private")}</option>
                </select>
              </label>
              {createVisibility === "private" && (
                <label>
                  {L("비밀번호", "Password")}
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder={L("비밀번호", "Password")}
                  />
                </label>
              )}
              <label>
                {L("방 제목", "Room Title")}
                <input
                  type="text"
                  value={createRoomTitle}
                  onChange={(e) => setCreateRoomTitle(e.target.value)}
                  placeholder={L("예: 10x10 스피드전", "e.g. 10x10 Speed Run")}
                />
              </label>
              <div className="modalActions">
                <button onClick={() => setShowCreateModal(false)}>{L("취소", "Cancel")}</button>
                <button onClick={createRaceRoom} disabled={isLoading}>
                  {isLoading ? L("생성중...", "Creating...") : L("생성", "Create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div className="modalBackdrop" onClick={() => setShowJoinModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>{L("방 참가", "Join Room")}</h2>
              {joinModalSource === "manual" && (
                <label>
                  {L("방 코드", "Room Code")}
                  <input
                    type="text"
                    value={joinRoomCode}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      setJoinRoomCode(code);
                      const matched = publicRooms.find((r) => r.roomCode === code);
                      setJoinRoomType(matched ? (matched.isPrivate ? "private" : "public") : "unknown");
                    }}
                    placeholder={L("예: AB12CD", "e.g. AB12CD")}
                  />
                </label>
              )}
              {joinRoomType !== "public" && (
                <label>
                  {L("비밀번호(비밀방만)", "Password (private rooms only)")}
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder={L("비밀방 비밀번호", "Private room password")}
                  />
                </label>
              )}
              <div className="modalActions">
                <button onClick={() => setShowJoinModal(false)}>{L("취소", "Cancel")}</button>
                <button
                  onClick={joinRaceRoom}
                  disabled={
                    isLoading ||
                    (joinModalSource === "manual" && !joinRoomCode.trim()) ||
                    (joinRoomType !== "public" && !joinPassword.trim())
                  }
                >
                  {isLoading ? L("참가중...", "Joining...") : L("참가", "Join")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showNeedLoginPopup && (
          <div className="modalBackdrop" onClick={() => setShowNeedLoginPopup(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>{L("로그인 필요", "Login Required")}</h2>
              <p>{needLoginReturnMode === "pvp"
                ? L("PVP 매칭은 로그인 후 이용 가능합니다.", "PVP matchmaking requires login.")
                : needLoginReturnMode === "placement_test"
                  ? L("배치고사는 로그인 후 진행할 수 있습니다.", "Placement is available after login.")
                  : L("멀티플레이는 로그인 후 이용 가능합니다.", "Multiplayer requires login.")}</p>
              <div className="modalActions">
                <button onClick={() => setShowNeedLoginPopup(false)}>{L("취소", "Cancel")}</button>
                <button
                  onClick={() => {
                    setShowNeedLoginPopup(false);
                    openAuthScreen("login", needLoginReturnMode);
                  }}
                >
                  {L("로그인하러 가기", "Go to Login")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPlacementRequiredPopup && (
          <div className="modalBackdrop" onClick={() => setShowPlacementRequiredPopup(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>{L("배치고사 필요", "Placement Required")}</h2>
              <p>
                {L(
                  "PvP 시작 전 배치고사를 완료해야 합니다. 배치고사 결과로 초기 티어와 시작 레이팅이 부여됩니다.",
                  "You must complete placement before entering PvP. Your initial tier and starting rating are assigned from the placement result."
                )}
              </p>
              <div className="placementEntryWarning compact">
                {L(
                  "주의! 배치고사는 계정당 한 번만 볼 수 있습니다.",
                  "Warning! Placement can only be taken once per account."
                )}
              </div>
              <div className="modalActions">
                <button onClick={() => setShowPlacementRequiredPopup(false)}>{L("취소", "Cancel")}</button>
                <button
                  onClick={() => {
                    setShowPlacementRequiredPopup(false);
                    goPlacementTestMode();
                  }}
                >
                  {L("배치고사 하러 가기", "Go to Placement")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showVoteModal && activeVote?.pending && (
          <div className="modalBackdrop voteModalBackdrop" onClick={() => setShowVoteModal(false)}>
            <motion.div
              className="modalCard voteModal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
            >
              <button
                type="button"
                className="voteModalClose"
                onClick={() => setShowVoteModal(false)}
                aria-label={L("닫기", "Close")}
              >
                ×
              </button>
              <div className="voteModalHeader">
                <div className="voteModalEyebrow">{lang === "ko" ? activeVote.titleKo : activeVote.titleEn}</div>
                <h2>{lang === "ko" ? activeVote.questionKo : activeVote.questionEn}</h2>
              </div>
              <div className="voteOptionGrid">
                {(Array.isArray(activeVote.options) ? activeVote.options : []).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="voteOptionCard"
                    onClick={() => submitVote(option.key)}
                    disabled={voteSubmitting}
                  >
                    <div className="voteOptionImageWrap">
                      <img
                        className="voteOptionImage"
                        src={getVoteOptionImageSrc(option)}
                        alt={lang === "ko" ? option.labelKo : option.labelEn}
                      />
                    </div>
                    <div className="voteOptionLabel">{lang === "ko" ? option.labelKo : option.labelEn}</div>
                  </button>
                ))}
              </div>
              {voteError && <div className="modalError">{voteError}</div>}
            </motion.div>
          </div>
        )}

        {showPvpTierGuideModal && (
          <div className="modalBackdrop pvpTierGuideBackdrop" onClick={() => setShowPvpTierGuideModal(false)}>
            <motion.div
              className="pvpTierGuideModal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.84, y: 42, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.94, y: 20, filter: "blur(6px)" }}
              transition={{ type: "spring", stiffness: 210, damping: 22, mass: 0.9 }}
            >
              <div className="pvpTierGuideAura" aria-hidden="true" />
              <div className="pvpTierGuideBadge">{L("티어 안내", "TIER GUIDE")}</div>
              <button
                type="button"
                className="pvpTierGuideClose"
                onClick={() => setShowPvpTierGuideModal(false)}
                aria-label={L("닫기", "Close")}
              >
                ×
              </button>
              <div className="pvpTierGuideFrame">
                <img
                  className="pvpTierGuideModalImage"
                  src={lang === "ko" ? TIER_GUIDE_IMAGE_MAP.ko : TIER_GUIDE_IMAGE_MAP.en}
                  alt={lang === "ko" ? "티어 안내" : "Tier guide"}
                />
              </div>
            </motion.div>
          </div>
        )}

        {showSettingsModal && (
          <div className="modalBackdrop" onClick={() => setShowSettingsModal(false)}>
            <div className="modalCard settingsModal" onClick={(e) => e.stopPropagation()}>
              <h2>{L("설정", "Settings")}</h2>
              <div className="settingsSection">
                <div className="settingsLabel">{L("언어", "Language")}</div>
                <div className="settingsChoices">
                  <button
                    type="button"
                    className={`settingsChoice ${settingsDraft.lang === "ko" ? "active" : ""}`}
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, lang: "ko" }))}
                  >
                    KO
                  </button>
                  <button
                    type="button"
                    className={`settingsChoice ${settingsDraft.lang === "en" ? "active" : ""}`}
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, lang: "en" }))}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="settingsSection">
                <div className="settingsLabel">{L("테마", "Theme")}</div>
                <div className="settingsChoices">
                  <button
                    type="button"
                    className={`settingsChoice ${settingsDraft.theme === "light" ? "active" : ""}`}
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, theme: "light" }))}
                  >
                    <Sun size={14} /> {L("라이트", "Light")}
                  </button>
                  <button
                    type="button"
                    className={`settingsChoice ${settingsDraft.theme === "dark" ? "active" : ""}`}
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, theme: "dark" }))}
                  >
                    <Moon size={14} /> {L("다크", "Dark")}
                  </button>
                </div>
              </div>

              <div className="settingsSection">
                <div className="settingsLabel">{L("사운드", "Sound")}</div>
                <div className="settingsRangeWrap">
                  <span className="settingsRangeIcon">
                    {Number(settingsDraft.soundVolume || 0) <= 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </span>
                  <input
                    className="settingsRange"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Number(settingsDraft.soundVolume || 0)}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        soundVolume: normalizeUiSoundVolume(e.target.value),
                      }))
                    }
                  />
                  <span className="settingsRangeValue">{Number(settingsDraft.soundVolume || 0)}%</span>
                </div>
              </div>
              {settingsError && <div className="modalError">{settingsError}</div>}
              <div className="modalActions">
                <button onClick={() => setShowSettingsModal(false)}>{L("취소", "Cancel")}</button>
                <button onClick={saveSettings} disabled={settingsSaving}>
                  {settingsSaving ? L("저장 중...", "Saving...") : L("저장", "Save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showProfileModal && (
          <div className="modalBackdrop" onClick={closeProfileModal}>
            <div className="modalCard profileModal" onClick={(e) => e.stopPropagation()}>
              {profileModalLoading ? (
                <div className="profileLoadingState">{L("프로필 불러오는 중...", "Loading profile...")}</div>
              ) : (
                <>
                  <div className="profileHero">
                    {profileModalMode === "self" ? (
                      <button
                        type="button"
                        className={`profileHeroAvatarButton ${profilePickerOpen ? "open" : ""}`}
                        onClick={() => setProfilePickerOpen((prev) => !prev)}
                      >
                        <ProfileAvatar
                          avatarKey={profileModalAvatarKey}
                          nickname={profileModalData?.nickname}
                          size="xl"
                        />
                        <span className="profileHeroAvatarChevron">
                          <ChevronDown size={18} />
                        </span>
                      </button>
                    ) : (
                      <ProfileAvatar
                        avatarKey={profileModalAvatarKey}
                        nickname={profileModalData?.nickname}
                        size="xl"
                      />
                    )}
                    <div className="profileHeroMeta">
                      <div className="profileEyebrow">
                        {profileModalMode === "self" ? L("내 프로필", "My Profile") : L("플레이어 프로필", "Player Profile")}
                      </div>
                      <h2>{profileModalData?.nickname || L("알 수 없는 플레이어", "Unknown Player")}</h2>
                      {profileModalTier && (
                        <div className="profileTierLine">
                          <img
                            className="profileTierBadge"
                            src={TIER_IMAGE_MAP[profileModalTier.key] || TIER_IMAGE_MAP.bronze}
                            alt={profileModalTierLabel}
                          />
                          <span>{profileModalTierLabel}</span>
                          <span>R {Number(profileModalData?.rating || 0)}</span>
                          {profileModalRankText && <span>{profileModalRankText}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {profileModalError && <div className="modalError">{profileModalError}</div>}

                  {profileModalData && (
                    <>
                      <div className="profileStatsGrid">
                        <div className="profileStatCard">
                          <span>{L("판수", "Games")}</span>
                          <strong>{Number(profileModalData.rating_games || 0)}</strong>
                        </div>
                        <div className="profileStatCard">
                          <span>{L("승", "Wins")}</span>
                          <strong>{Number(profileModalData.rating_wins || 0)}</strong>
                        </div>
                        <div className="profileStatCard">
                          <span>{L("패", "Losses")}</span>
                          <strong>{Number(profileModalData.rating_losses || 0)}</strong>
                        </div>
                        <div className="profileStatCard">
                          <span>{L("승률", "Win Rate")}</span>
                          <strong>{Math.round(Number(profileModalData.winRate || 0))}%</strong>
                        </div>
                        <div className="profileStatCard">
                          <span>{L("최고 연승", "Best Streak")}</span>
                          <strong>{Number(profileModalData.win_streak_best || 0)}</strong>
                        </div>
                        <div className="profileStatCard">
                          <span>{L("현재 연승", "Current Streak")}</span>
                          <strong>{Number(profileModalData.win_streak_current || 0)}</strong>
                        </div>
                      </div>

                      {profileModalMode === "self" ? (
                        <>
                          {profilePickerOpen && (
                            <div className="profilePickerPanel">
                              <div className="profileSection">
                                <div className="profileTabRow">
                                  <button
                                    type="button"
                                    className={`profileTabBtn ${profileAvatarTab === "default" ? "active" : ""}`}
                                    onClick={() => setProfileAvatarTab("default")}
                                  >
                                    {L("기본 프로필", "Default Profiles")}
                                  </button>
                                  <button
                                    type="button"
                                    className={`profileTabBtn ${profileAvatarTab === "special" ? "active" : ""}`}
                                    onClick={() => setProfileAvatarTab("special")}
                                  >
                                    {L("특별 프로필", "Special Profiles")}
                                  </button>
                                </div>
                              </div>

                              {profileAvatarTab === "default" ? (
                                <div className="profileSection">
                                  <div className="profileAvatarGrid profileAvatarGridScrollable profileAvatarGridDefaultPicker">
                                    {DEFAULT_PROFILE_AVATAR_OPTIONS.map((option) => {
                                      const selected = normalizeProfileAvatarKey(profileDraftAvatarKey) === option.key;
                                      const label = lang === "ko" ? option.labelKo : option.labelEn;
                                      return (
                                        <button
                                          key={option.key}
                                          type="button"
                                          title={label}
                                          aria-label={label}
                                          className={`profileAvatarOption compact ${selected ? "selected" : ""}`}
                                          onClick={() => setProfileDraftAvatarKey(option.key)}
                                        >
                                          <ProfileAvatar avatarKey={option.key} nickname={profileModalData.nickname} size="picker" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="profileSection">
                                  <div className="profileAvatarGrid profileAvatarGridScrollable hall">
                                    {SPECIAL_PROFILE_AVATAR_OPTIONS.map((option) => {
                                      const unlocked = profileUnlockedSpecialKeys.has(option.key);
                                      const selected = normalizeProfileAvatarKey(profileDraftAvatarKey) === option.key;
                                      const label = lang === "ko" ? option.labelKo : option.labelEn;
                                      const unlockHint = lang === "ko" ? option.unlockHintKo : option.unlockHintEn;
                                      return (
                                        <button
                                          key={option.key}
                                          type="button"
                                          title={unlockHint}
                                          aria-label={label}
                                          data-tooltip={unlockHint}
                                          className={`profileAvatarOption hall compact hasTooltip ${selected ? "selected" : ""} ${unlocked ? "" : "locked"}`}
                                          onClick={() => {
                                            if (unlocked) setProfileDraftAvatarKey(option.key);
                                          }}
                                        >
                                          <ProfileAvatar avatarKey={option.key} nickname={profileModalData.nickname} size="picker" />
                                          {!unlocked && (
                                            <span className="profileAvatarLockBadge prominent">
                                              <Lock size={12} />
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : profileModalHallRewards.length > 0 ? (
                        <div className="profileSection">
                          <div className="profileSectionHead">
                            <div className="profileSectionTitle">{L("명예의 전당 기록", "Hall of Fame Records")}</div>
                          </div>
                          <div className="profileRewardList">
                            {profileModalHallRewards.map((reward) => {
                              const option = HALL_PROFILE_AVATAR_OPTIONS.find((entry) => entry.key === reward.key);
                              return (
                                <div key={`${reward.key}-${reward.finishedAtMs}`} className="profileRewardItem">
                                  <ProfileAvatar avatarKey={reward.key} nickname={profileModalData.nickname} size="md" />
                                  <div>
                                    <strong>{lang === "ko" ? option?.labelKo || reward.key : option?.labelEn || reward.key}</strong>
                                    <span>{formatRaceElapsedSec(Math.max(0, Number(reward.elapsedSec || 0)))}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}

                  <div className="modalActions">
                    <button onClick={closeProfileModal}>{profileModalMode === "self" ? L("닫기", "Close") : L("확인", "Close")}</button>
                    {profileModalMode === "self" && profileModalData && (
                      <button onClick={saveProfileAvatarSelection} disabled={profileModalSaving || !profileAvatarDirty}>
                        {profileModalSaving ? L("저장 중...", "Saving...") : L("프로필 저장", "Save Profile")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {shouldShowPuzzleBoard && !isInRaceRoom && (
          <div
            className={`boardWrap ${isMobileBoardUi ? "mobileBoardEnabled" : ""} ${isMobileBoardUi && mobileBoardFocus ? "mobileBoardFocus" : ""}`}
            onContextMenu={(e) => e.preventDefault()}
            data-tutorial={isSingleSoloMode ? "single-board" : undefined}
          >
            <div
              className={`mobileBoardScaleShell ${isMobileBoardUi ? "active" : ""}`}
              style={isMobileBoardUi ? { transform: `scale(${mobileBoardScale})` } : undefined}
            >
            <div className={`excelBoardScaffold ${isExcelMode ? "active" : ""}`}>
              {isExcelMode && (
                <div className="excelBoardHeaderRow" aria-hidden="true">
                  <div className="excelBoardHeadCorner" />
                  <div
                    className="excelBoardColLetters"
                    style={{
                      gridTemplateColumns: `repeat(${puzzle.width}, ${cellSize}px)`,
                      marginLeft: `${maxRowHintDepth * cellSize}px`,
                      width: `${puzzle.width * cellSize}px`,
                    }}
                  >
                    {excelBoardCols.map((label, idx) => (
                      <span key={`solo-col-${idx}`}>{label}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className={`excelBoardBodyRow ${isExcelMode ? "active" : ""}`}>
                {isExcelMode && (
                  <div
                    className="excelBoardRowNumbers"
                    aria-hidden="true"
                    style={{
                      gridTemplateRows: `repeat(${puzzle.height}, ${cellSize}px)`,
                      marginTop: `${maxColHintDepth * cellSize}px`,
                      height: `${puzzle.height * cellSize}px`,
                    }}
                  >
                    {excelBoardRows.map((label, idx) => (
                      <span key={`solo-row-${idx}`}>{label}</span>
                    ))}
                  </div>
                )}
                <div
                  className="nonogram"
                  style={{
                    "--cell-size": `${cellSize}px`,
                    "--left-depth": maxRowHintDepth,
                    "--top-depth": maxColHintDepth,
                    "--board-w": puzzle.width,
                    "--board-h": puzzle.height,
                  }}
                >
                  <div className="corner" />

                  <div
                    className="colHints"
                    style={{
                      gridTemplateColumns: `repeat(${puzzle.width}, var(--cell-size))`,
                    }}
                  >
                    {colHints.map((hint, colIdx) => (
                      <div
                        key={`col-${colIdx}`}
                        className="colHintCol"
                        style={{ gridTemplateRows: `repeat(${maxColHintDepth}, var(--cell-size))` }}
                      >
                        {Array.from({ length: maxColHintDepth }).map((_, depthIdx) => {
                          const value = hint[hint.length - maxColHintDepth + depthIdx];
                          const hintId = `c-${colIdx}-${depthIdx}`;
                          const solvedByHint = solvedCols.has(colIdx) && value != null;
                          return (
                            <button
                              key={hintId}
                              type="button"
                              className={`hintNum ${activeHints.has(hintId) ? "active" : ""} ${solvedByHint ? "solved" : ""}`}
                              onClick={() => toggleHint(hintId)}
                            >
                              {value ?? ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div
                    className="rowHints"
                    style={{ gridTemplateRows: `repeat(${puzzle.height}, var(--cell-size))` }}
                  >
                    {rowHints.map((hint, rowIdx) => (
                      <div
                        key={`row-${rowIdx}`}
                        className={`rowHintRow ${tutorialHighlightRows.includes(rowIdx) ? "tutorialHintPulse" : ""}`}
                        style={{ gridTemplateColumns: `repeat(${maxRowHintDepth}, var(--cell-size))` }}
                      >
                        {Array.from({ length: maxRowHintDepth }).map((_, depthIdx) => {
                          const value = hint[hint.length - maxRowHintDepth + depthIdx];
                          const hintId = `r-${rowIdx}-${depthIdx}`;
                          const solvedByHint = solvedRows.has(rowIdx) && value != null;
                          return (
                            <button
                              key={hintId}
                              type="button"
                              className={`hintNum ${activeHints.has(hintId) ? "active" : ""} ${solvedByHint ? "solved" : ""}`}
                              onClick={() => toggleHint(hintId)}
                            >
                              {value ?? ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div
                    ref={boardRef}
                    className="board"
                    style={{
                      width: `${puzzle.width * cellSize}px`,
                      height: `${puzzle.height * cellSize}px`,
                      cursor: canInteractBoard ? "crosshair" : "not-allowed",
                    }}
                    onPointerDown={onBoardPointerDown}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <canvas ref={canvasRef} className="boardCanvas" />
                    {isModeTutorial && tutorialHighlightCells.length > 0 && (
                      <div className="tutorialGuideLayer" aria-hidden="true">
                        {tutorialHighlightCells.map((index) => {
                          const x = index % puzzle.width;
                          const y = Math.floor(index / puzzle.width);
                          return (
                            <span
                              key={`guide-${index}`}
                              className="tutorialGuideCell"
                              style={{
                                left: `${x * cellSize}px`,
                                top: `${y * cellSize}px`,
                                width: `${cellSize}px`,
                                height: `${cellSize}px`,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                    {isRaceCountdown && (
                      <div className="countdownOverlay">{countdownLeft ?? 0}</div>
                    )}
                    {isRaceLobby && <div className="countdownOverlay wait">{L("READY 대기", "Waiting for READY")}</div>}
                    {isRaceFinished && !isModePvp && <div className="countdownOverlay result">{raceResultText}</div>}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </motion.section>
    </main>
  );
}

export default App;


