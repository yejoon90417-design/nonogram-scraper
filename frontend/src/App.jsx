import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { motion } from "framer-motion";
import { ChevronDown, Eraser, Home, Lock, LogIn, Redo2, Sparkles, Undo2, User, UserPlus, Volume2, VolumeX } from "lucide-react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://nonogram-api.onrender.com").replace(/\/$/, "");
const MAX_HISTORY = 200;
const AUTH_TOKEN_KEY = "nonogram-auth-token";
const AUTH_USER_KEY = "nonogram-auth-user";
const TUTORIAL_SEEN_KEY = "nonogram-tutorial-seen-v1";
const POOP_SFX_URL = `${import.meta.env.BASE_URL}sounds/poot.mp3`;
const PVP_SIZE_KEYS = ["5x5", "10x10", "15x15", "20x20", "25x25"];
const PVP_REVEAL_RESULT_HOLD_MS = 1600;

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
    prompt: "힌트 5: 2번째 줄 5칸을 전부 칠하세요.",
    rowHighlights: [1],
    fill: [5, 6, 7, 8, 9],
  },
  {
    key: "row3full",
    title: "3번째 줄 힌트 5",
    prompt: "같은 논리: 3번째 줄도 전부 칠하세요.",
    rowHighlights: [2],
    fill: [10, 11, 12, 13, 14],
  },
  {
    key: "row4gaps",
    title: "4번째 줄 힌트 1 1 1",
    prompt: "1칸씩 3묶음이므로 사이칸은 X 표시하세요.",
    rowHighlights: [3],
    mark: [16, 18],
    cellHighlights: [16, 18],
  },
  {
    key: "row4fills",
    title: "4번째 줄 채우기",
    prompt: "남은 칸(1,3,5번째 칸)을 칠하세요.",
    rowHighlights: [3],
    fill: [15, 17, 19],
    cellHighlights: [15, 17, 19],
  },
  {
    key: "row1pair",
    title: "1번째 줄 힌트 1 1",
    prompt: "1번째 줄은 떨어진 1칸 2개입니다. 가운데 두 칸을 칠하세요.",
    rowHighlights: [0],
    fill: [1, 3],
    cellHighlights: [1, 3],
  },
  {
    key: "row5three",
    title: "5번째 줄 힌트 3",
    prompt: "마지막 줄은 가운데 3칸을 칠하면 됩니다.",
    rowHighlights: [4],
    fill: [21, 22, 23],
    cellHighlights: [21, 22, 23],
  },
  {
    key: "finish",
    title: "완성",
    prompt: "잘했어요. 퍼즐 완성!",
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
  throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
}

function isRaceOnlyStatusMessage(message) {
  if (!message) return false;
  return (
    message === "승리하였습니다." ||
    message === "패배하였습니다." ||
    message === "완주! 다른 플레이어 결과 대기중..." ||
    message === "5초 후 시작합니다."
  );
}

function App() {
  const [playMode, setPlayMode] = useState("menu"); // menu | single | multi | pvp | tutorial | auth
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
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [authToken, setAuthToken] = useState(localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authTab, setAuthTab] = useState("login"); // login | signup
  const [authReturnMode, setAuthReturnMode] = useState("menu");
  const [showNeedLoginPopup, setShowNeedLoginPopup] = useState(false);
  const [needLoginReturnMode, setNeedLoginReturnMode] = useState("multi");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState({ username: "", password: "" });
  const [signupUsername, setSignupUsername] = useState("");
  const [signupNickname, setSignupNickname] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupFieldErrors, setSignupFieldErrors] = useState({ username: "", nickname: "", password: "" });
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionMenuForPlayerId, setReactionMenuForPlayerId] = useState("");
  const [reactionFlights, setReactionFlights] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(true);
  const [pvpTicketId, setPvpTicketId] = useState("");
  const [pvpSearching, setPvpSearching] = useState(false);
  const [pvpQueueSize, setPvpQueueSize] = useState(0);
  const [pvpServerState, setPvpServerState] = useState("idle"); // idle | waiting | matching | ready | cancelled
  const [pvpMatch, setPvpMatch] = useState(null);
  const [pvpAcceptBusy, setPvpAcceptBusy] = useState(false);
  const [pvpBanBusy, setPvpBanBusy] = useState(false);
  const [pvpRevealIndex, setPvpRevealIndex] = useState(0);
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const chatBodyRef = useRef(null);
  const emojiWrapRef = useRef(null);
  const playerBadgeRefs = useRef(new Map());
  const seenReactionIdsRef = useRef(new Set());
  const reactionFlightsRef = useRef([]);
  const dragRef = useRef(null); // { button: 'left'|'right', paintValue }
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
  const raceRoomCodeRef = useRef("");
  const racePlayerIdRef = useRef("");
  const pvpTicketRef = useRef("");
  const pvpMatchPhaseRef = useRef("");
  const pvpRevealSpinPrevRef = useRef(false);
  const raceFinishedSentRef = useRef(false);
  const raceResultShownRef = useRef(false);
  const raceProgressLastSentRef = useRef(0);
  const raceProgressBusyRef = useRef(false);
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const countdownCueRef = useRef(-1);
  const prevRacePhaseRef = useRef("idle");
  const lastPaintSfxAtRef = useRef(0);
  const poopBufferRef = useRef(null);
  const poopLoadingRef = useRef(false);
  const poopAudioFallbackRef = useRef(null);
  const tutorialCompleteShownRef = useRef(false);
  const deferredCells = useDeferredValue(cells);

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
        setAuthUser(data.user);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
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

  useEffect(() => {
    const ctx = ensureAudio();
    if (!ctx || poopBufferRef.current || poopLoadingRef.current) return;
    poopLoadingRef.current = true;
    fetch(POOP_SFX_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        poopBufferRef.current = decoded;
      })
      .catch(() => {
        // keep fallback tone
      })
      .finally(() => {
        poopLoadingRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (poopAudioFallbackRef.current) return;
    const audio = new Audio(POOP_SFX_URL);
    audio.preload = "auto";
    audio.volume = 1;
    poopAudioFallbackRef.current = audio;
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

  const isBoardCompleteByHints = useMemo(() => {
    if (!puzzle) return false;
    return solvedRows.size === puzzle.height && solvedCols.size === puzzle.width;
  }, [puzzle, solvedRows, solvedCols]);
  const isModeMenu = playMode === "menu";
  const isModeSingle = playMode === "single";
  const isModeMulti = playMode === "multi";
  const isModePvp = playMode === "pvp";
  const isModeAuth = playMode === "auth";
  const isModeTutorial = playMode === "tutorial";
  const isLoggedIn = Boolean(authToken && authUser);
  const isInRaceRoom = Boolean(raceRoomCode);
  const isSingleSoloMode = (isModeSingle || isModeTutorial) && !isInRaceRoom;
  const shouldShowPuzzleBoard = Boolean(
    puzzle && ((isSingleSoloMode && !isInRaceRoom) || ((isModeMulti || isModePvp) && isInRaceRoom))
  );
  const racePhase = raceState?.state || "idle";
  const isRaceLobby = isInRaceRoom && racePhase === "lobby";
  const isRaceCountdown = isInRaceRoom && racePhase === "countdown";
  const isRacePlaying = isInRaceRoom && racePhase === "playing";
  const isRaceFinished = isInRaceRoom && racePhase === "finished";
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
      return "승리하였습니다";
    }
    return "패배하였습니다";
  }, [raceState, racePlayerId]);
  const roomTitleText = raceState?.roomTitle || "";
  const chatMessages = Array.isArray(raceState?.chatMessages) ? raceState.chatMessages : [];
  const reactionEvents = Array.isArray(raceState?.reactionEvents) ? raceState.reactionEvents : [];

  const countdownLeft = useMemo(() => {
    if (!isRaceCountdown || !raceState?.gameStartAt) return null;
    const ms = new Date(raceState.gameStartAt).getTime() - nowMs;
    return Math.max(0, Math.ceil(ms / 1000));
  }, [isRaceCountdown, raceState, nowMs]);
  const pvpMatchState = pvpMatch?.state || "";
  const pvpOptions = Array.isArray(pvpMatch?.options) ? pvpMatch.options : [];
  const pvpAcceptLeftMs = useMemo(() => {
    if (pvpMatchState !== "accept") return 0;
    const deadlineAt = Number(pvpMatch?.acceptDeadlineAt || 0);
    if (!deadlineAt) return 0;
    return Math.max(0, deadlineAt - nowMs);
  }, [pvpMatchState, pvpMatch, nowMs]);
  const pvpBanLeftMs = useMemo(() => {
    if (pvpMatchState !== "ban") return 0;
    const deadlineAt = Number(pvpMatch?.banDeadlineAt || 0);
    if (!deadlineAt) return 0;
    return Math.max(0, deadlineAt - nowMs);
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

  const ensureAudio = () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    return ctx;
  };

  const authHeaders = useMemo(() => {
    if (!authToken) return {};
    return { Authorization: `Bearer ${authToken}` };
  }, [authToken]);

  const tone = (freq, durMs, { type = "square", gain = 0.1, slideTo = null } = {}) => {
    if (!soundOn) return;
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
    if (!soundOn) return;
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

  const playPoopSfx = () => {
    if (!soundOn) return;
    const ctx = ensureAudio();
    const master = masterGainRef.current;
    if (!ctx || !master || !poopBufferRef.current) {
      const fallback = poopAudioFallbackRef.current;
      if (!fallback) return;
      try {
        fallback.currentTime = 0;
        fallback.volume = 1;
        fallback.play().catch(() => {});
      } catch {
        // ignore fallback playback errors
      }
      return;
    }
    try {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = poopBufferRef.current;
      const gain = ctx.createGain();
      gain.gain.value = 2.1;
      src.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // ignore playback errors
    }
  };

  const handleToggleSfx = () => {
    setSoundOn((prev) => {
      const next = !prev;
      if (next) {
        const ctx = ensureAudio();
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
        setTimeout(() => playSfx("ui"), 0);
      }
      return next;
    });
  };

  const markTutorialSeen = () => {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      // ignore localStorage errors
    }
  };

  const startTutorialMode = () => {
    if (isInRaceRoom) {
      setStatus("방 대전 중에는 튜토리얼을 시작할 수 없습니다.");
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
      let res = await fetch(`${API_BASE}/puzzles-random?width=${width}&height=${height}`);
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/puzzles/random?width=${width}&height=${height}`);
      }
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load random puzzle.");
      }
      initializePuzzle(data.puzzle, {
        resume: true,
        message: `Puzzle ${data.puzzle.id} (${data.puzzle.width}x${data.puzzle.height}) loaded.`,
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
    setSignupFieldErrors({ username: "", nickname: "", password: "" });
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
    if (!isInRaceRoom) clearPuzzleViewState();
    setPlayMode("pvp");
    setStatus("");
  };

  const backToMenu = async () => {
    if (isInRaceRoom) {
      setStatus("진행 중인 경기에서는 먼저 Leave를 눌러줘.");
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
    setAuthUser(user);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  };

  const clearAuth = () => {
    setAuthToken("");
    setAuthUser(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  };

  const signup = async () => {
    const username = signupUsername.trim().toLowerCase();
    const nickname = signupNickname.trim();
    const password = signupPassword;
    const fieldErrors = { username: "", nickname: "", password: "" };
    if (!username || !nickname || !password) {
      setSignupError("아이디, 닉네임, 비밀번호를 모두 입력해줘.");
      if (!username) fieldErrors.username = "아이디를 입력해줘.";
      if (!nickname) fieldErrors.nickname = "닉네임을 입력해줘.";
      if (!password) fieldErrors.password = "비밀번호를 입력해줘.";
      setSignupFieldErrors(fieldErrors);
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || password.length < 8) {
      fieldErrors.password = "영문+숫자 포함 8자 이상";
      setSignupFieldErrors(fieldErrors);
      return;
    }
    setSignupError("");
    setSignupFieldErrors({ username: "", nickname: "", password: "" });
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, nickname, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "회원가입 실패");
      storeAuth(data.token, data.user);
      setSignupUsername("");
      setSignupNickname("");
      setSignupPassword("");
      setStatus(`환영합니다, ${data.user.nickname}!`);
      setPlayMode(authReturnMode === "multi" || authReturnMode === "pvp" ? authReturnMode : "menu");
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("password must be 8+ chars")) {
        setSignupFieldErrors((prev) => ({ ...prev, password: "영문+숫자 포함 8자 이상" }));
      } else if (msg.includes("username must be 3-24 chars")) {
        setSignupFieldErrors((prev) => ({ ...prev, username: "아이디는 3~24자" }));
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
      setLoginError("아이디와 비밀번호를 입력해줘.");
      if (!username) fieldErrors.username = "아이디를 입력해줘.";
      if (!password) fieldErrors.password = "비밀번호를 입력해줘.";
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
      if (!res.ok || !data.ok) throw new Error(data.error || "로그인 실패");
      storeAuth(data.token, data.user);
      setLoginUsername("");
      setLoginPassword("");
      setStatus(`로그인 완료: ${data.user.nickname}`);
      setPlayMode(authReturnMode === "multi" || authReturnMode === "pvp" ? authReturnMode : "menu");
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("Invalid credentials")) {
        setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
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
    setStatus("로그아웃 되었습니다.");
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

  const pvpCancelReasonText = (reason) => {
    if (reason === "accept_timeout") return "매칭 수락 시간이 지나 자동 취소되었습니다.";
    if (reason === "cancelled_by_user") return "상대가 수락을 취소해 매칭이 종료되었습니다.";
    if (reason === "no_puzzle_for_selected_size") return "선택 가능한 퍼즐이 없어 매칭이 취소되었습니다.";
    if (reason === "puzzle_solution_missing") return "퍼즐 데이터 오류로 매칭이 취소되었습니다.";
    if (reason === "invalid_selected_size") return "매칭 설정 오류로 매칭이 취소되었습니다.";
    return "매칭이 취소되었습니다.";
  };

  const resetPvpQueueState = () => {
    stopPvpPolling();
    stopPvpRevealAnimation();
    setPvpSearching(false);
    setPvpTicketId("");
    setPvpQueueSize(0);
    setPvpServerState("idle");
    setPvpMatch(null);
    setPvpAcceptBusy(false);
    setPvpBanBusy(false);
    setPvpRevealIndex(0);
    pvpMatchPhaseRef.current = "";
  };

  const applyPvpMatch = (data) => {
    stopPvpPolling();
    stopPvpRevealAnimation();
    setPvpSearching(false);
    setPvpQueueSize(0);
    setPvpServerState("ready");
    setPvpMatch(null);
    setPvpAcceptBusy(false);
    setPvpBanBusy(false);
    setPvpRevealIndex(0);
    pvpMatchPhaseRef.current = "";
    if (data.ticketId) setPvpTicketId(data.ticketId);
    setRaceRoomCode(data.roomCode);
    setRacePlayerId(data.playerId);
    applyRaceRoomState(data.room, data.playerId);
    initializePuzzle(data.puzzle, {
      resume: false,
      startTimer: false,
      message: "매칭 성공! 5초 카운트다운 후 시작됩니다.",
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
      setShowNeedLoginPopup(true);
      return;
    }
    if (isInRaceRoom) {
      setStatus("이미 경기 방에 참여 중입니다.");
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
      if (!res.ok || !data.ok) throw new Error(data.error || "매칭 대기열 참가 실패");
      const nextState = applyPvpStatusPayload(data);
      if (nextState === "ready" || nextState === "cancelled") {
        return;
      }
      setStatus(nextState === "matching" ? "매칭 성사! 수락 버튼을 눌러주세요." : "상대를 찾는 중...");
      setPlayMode("pvp");
      startPvpPolling(String(data.ticketId || ""));
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
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
    if (!silent) setStatus("매칭 대기를 취소했습니다.");
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
      if (!res.ok || !data.ok) throw new Error(data.error || "수락 처리 실패");
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
      if (!res.ok || !data.ok) throw new Error(data.error || "밴 처리 실패");
      applyPvpStatusPayload(data);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setPvpBanBusy(false);
    }
  };

  const leaveRace = async () => {
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
        await fetch(`${API_BASE}/race/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId }),
        });
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
    setReactionMenuForPlayerId("");
    setReactionFlights([]);
    setPublicRooms([]);
    setStatus("");
    seenReactionIdsRef.current = new Set();
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
      setStatus("멀티플레이는 로그인 후 이용 가능해.");
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
      setStatus("비밀방 비밀번호를 입력해줘.");
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
      setStatus("멀티플레이는 로그인 후 이용 가능해.");
      return;
    }
    if (!code) {
      setStatus("방 코드를 입력해줘.");
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
      setStatus("5초 후 시작합니다.");
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
          message: "새 게임 준비 완료. 다시 Ready를 눌러 시작해.",
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
      if (!res.ok || !data.ok) throw new Error(data.error || "채팅 전송 실패");
      applyRaceRoomState(data.room);
      setChatInput("");
      setShowEmojiPicker(false);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setChatSending(false);
    }
  };

  const sendReaction = async (targetPlayerId, emoji) => {
    if (!raceRoomCode || !racePlayerId || !targetPlayerId) return;
    if (targetPlayerId === racePlayerId) return;
    try {
      const res = await fetch(`${API_BASE}/race/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ roomCode: raceRoomCode, playerId: racePlayerId, targetPlayerId, emoji }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "리액션 전송 실패");
      applyRaceRoomState(data.room);
    } catch (err) {
      setStatus(err.message);
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

  const startPaint = (index, buttonType) => {
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
    dragRef.current = { button: buttonType, paintValue };
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

    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < puzzle.height; y += 1) {
      for (let x = 0; x < puzzle.width; x += 1) {
        const v = cells[y * puzzle.width + x];
        const px = x * cellSize;
        const py = y * cellSize;
        if (v === 1) {
          ctx.fillStyle = "#1d1d1d";
          ctx.fillRect(px, py, cellSize, cellSize);
          // Filled cells keep a subtle border so adjacent blacks remain distinguishable.
          ctx.strokeStyle = "#7f8d9b";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
        } else if (v === 2) {
          ctx.strokeStyle = "#8f0000";
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

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
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

    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
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

    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, [puzzle, cells, cellSize]);

  useEffect(() => {
    const onWindowPointerMove = (event) => {
      const dragState = dragRef.current;
      if (!dragState) return;

      const leftPressed = (event.buttons & 1) === 1;
      const rightPressed = (event.buttons & 2) === 2;
      if (dragState.button === "left" && !leftPressed) return;
      if (dragState.button === "right" && !rightPressed) return;

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
    if (now - raceProgressLastSentRef.current < 600) return;
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
    if (!shouldTickRace && !shouldTickPvp) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [isInRaceRoom, isRaceCountdown, isRacePlaying, isModePvp, pvpSearching, pvpMatchState]);

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
    if (!puzzle) {
      autoSolvedShownRef.current = false;
      return;
    }
    if (isBoardCompleteByHints && !autoSolvedShownRef.current) {
      autoSolvedShownRef.current = true;
      setTimerRunning(false);
      if (isModeTutorial) {
        // Tutorial completion status is handled by tutorial progress effect.
      } else if (isInRaceRoom && isRacePlaying) {
        setStatus("완주! 다른 플레이어 결과 대기중...");
      } else {
        setStatus("Success! Puzzle solved.");
      }
      submitRaceFinish();
    }
    if (!isBoardCompleteByHints) {
      autoSolvedShownRef.current = false;
    }
  }, [isBoardCompleteByHints, puzzle, isInRaceRoom, isRacePlaying, isModeTutorial]);

  useEffect(() => {
    if (!isInRaceRoom || racePhase !== "finished" || !raceState?.winnerPlayerId || raceResultShownRef.current) return;
    raceResultShownRef.current = true;
    if (raceState.winnerPlayerId === racePlayerId) {
      setStatus("승리하였습니다.");
      playSfx("win");
    } else {
      setStatus("패배하였습니다.");
      setTimerRunning(false);
      playSfx("lose");
    }
  }, [isInRaceRoom, racePhase, raceState, racePlayerId]);

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
    if (!isModePvp || !pvpSearching || isInRaceRoom || pvpMatchState !== "reveal" || pvpOptions.length === 0) {
      stopPvpRevealAnimation();
      return;
    }
    if (!isPvpRevealSpinning) {
      stopPvpRevealAnimation();
      const chosenIdx = pvpOptions.findIndex((o) => o.sizeKey === pvpMatch?.chosenSizeKey);
      if (chosenIdx >= 0) setPvpRevealIndex(chosenIdx);
      return;
    }

    stopPvpRevealAnimation();
    let idx = Math.floor(Math.random() * pvpOptions.length);
    setPvpRevealIndex(idx);
    pvpRevealAnimRef.current = window.setInterval(() => {
      idx = (idx + 1) % pvpOptions.length;
      setPvpRevealIndex(idx);
      playSfx("roulette-tick");
    }, 95);
    return () => {
      stopPvpRevealAnimation();
    };
  }, [isModePvp, pvpSearching, isInRaceRoom, pvpMatchState, pvpOptions, pvpMatch?.chosenSizeKey, isPvpRevealSpinning]);

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
          message: `방 퍼즐이 변경됨: ${data.puzzle.id}`,
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
    reactionFlightsRef.current = reactionFlights;
  }, [reactionFlights]);

  useEffect(() => {
    if (!isInRaceRoom || reactionEvents.length === 0) return;
    const nextFlights = [];
    for (const event of reactionEvents) {
      if (!event?.id || seenReactionIdsRef.current.has(event.id)) continue;
      seenReactionIdsRef.current.add(event.id);
      const fromEl = playerBadgeRefs.current.get(event.fromPlayerId);
      const toEl = playerBadgeRefs.current.get(event.toPlayerId);
      if (!fromEl || !toEl) continue;
      const from = fromEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      const id = `${event.id}-${Date.now()}`;
      nextFlights.push({
        id,
        emoji: event.emoji,
        x: from.left + from.width / 2,
        y: from.top + from.height / 2,
        dx: to.left + to.width / 2 - (from.left + from.width / 2),
        dy: to.top + to.height / 2 - (from.top + from.height / 2),
      });
      if (event.emoji === "💩") {
        playPoopSfx();
      }
    }
    if (!nextFlights.length) return;
    setReactionFlights((prev) => [
      ...prev,
      ...nextFlights.map((f) => ({
        ...f,
        x0: f.x,
        y0: f.y,
        x: f.x,
        y: f.y,
        opacity: 1,
        scale: 0.98,
        startTs: performance.now(),
        durationMs: 840,
      })),
    ]);
  }, [reactionEvents, isInRaceRoom]);

  useEffect(() => {
    if (reactionFlights.length === 0) return;
    let rafId = 0;

    const tick = (now) => {
      const current = reactionFlightsRef.current;
      if (!current.length) return;
      const next = [];
      for (const f of current) {
        const t = Math.max(0, Math.min(1, (now - f.startTs) / f.durationMs));
        if (t >= 1) continue;
        const ease = 1 - (1 - t) * (1 - t) * (1 - t);
        const arc = Math.min(120, Math.max(42, Math.hypot(f.dx, f.dy) * 0.18));
        const x = f.x0 + f.dx * ease;
        const y = f.y0 + f.dy * ease - arc * (4 * t * (1 - t));
        const opacity = 1;
        const scale = 0.94 + 0.16 * (1 - t);
        next.push({ ...f, x, y, opacity, scale });
      }
      reactionFlightsRef.current = next;
      setReactionFlights(next);
      if (next.length) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [reactionFlights.length]);

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

  useEffect(() => {
    if (!reactionMenuForPlayerId) return;
    const onDocPointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.(".reactionMenu")) return;
      if (target?.closest?.(".nickBtn")) return;
      setReactionMenuForPlayerId("");
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [reactionMenuForPlayerId]);

  return (
    <main className="page">
      <div className="bgGlow bgGlowA" />
      <div className="bgGlow bgGlowB" />
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`panel ${isModeMenu || isModeAuth ? "panelMenu" : ""}`}
      >
        <div className="topBar">
          <div className="brandWrap">
            <div className="logoPixel" aria-hidden="true" />
            <h1 className="title">Nonogram Arena</h1>
          </div>
          {!isModeAuth && (
            <div className="topAuth">
              <button className="ghostBtn tutorialTriggerBtn" onClick={startTutorialMode}>
                <Sparkles size={15} /> {isModeTutorial ? "Restart Tutorial" : "Tutorial"}
              </button>
              {isLoggedIn ? (
                <>
                  <span className="userChip">
                    {authUser.nickname} ({authUser.username})
                  </span>
                  <button onClick={logout}>로그아웃</button>
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
                {!isLoggedIn && <span className="modeTag">Login Required</span>}
                <span className="modeName">MULTI PLAYER</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modePvp"
                onClick={goPvpMode}
              >
                {!isLoggedIn && <span className="modeTag">Login Required</span>}
                <span className="modeName">PVP MATCH</span>
              </motion.button>
            </div>
            <button className="menuTutorialBtn" onClick={startTutorialMode}>
              HOW TO PLAY
            </button>
            <div className="menuDust menuDustA" />
            <div className="menuDust menuDustB" />
            <div className="menuDust menuDustC" />
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
                }}
              >
                로그인
              </button>
              <button
                className={authTab === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthTab("signup");
                  setSignupError("");
                  setSignupFieldErrors({ username: "", nickname: "", password: "" });
                }}
              >
                회원가입
              </button>
              <button onClick={backToMenu}>메인으로</button>
            </div>

            {authTab === "login" && (
              <div className="authCard">
                <label>
                  아이디
                  <input
                    type="text"
                    className={loginFieldErrors.username ? "fieldError" : ""}
                    value={loginUsername}
                    onChange={(e) => {
                      setLoginUsername(e.target.value);
                      setLoginFieldErrors((prev) => ({ ...prev, username: "" }));
                      if (loginError) setLoginError("");
                    }}
                    placeholder="아이디"
                  />
                  {loginFieldErrors.username && <span className="fieldErrorText">{loginFieldErrors.username}</span>}
                </label>
                <label>
                  비밀번호
                  <input
                    type="password"
                    className={loginFieldErrors.password ? "fieldError" : ""}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginFieldErrors((prev) => ({ ...prev, password: "" }));
                      if (loginError) setLoginError("");
                    }}
                    placeholder="비밀번호"
                  />
                  {loginFieldErrors.password && <span className="fieldErrorText">{loginFieldErrors.password}</span>}
                </label>
                {loginError && <div className="modalError">{loginError}</div>}
                <div className="modalActions">
                  <button onClick={backToMenu}>취소</button>
                  <button onClick={login} disabled={isLoading || !loginUsername.trim() || !loginPassword}>
                    {isLoading ? "로그인 중..." : "로그인"}
                  </button>
                </div>
              </div>
            )}

            {authTab === "signup" && (
              <div className="authCard">
                <label>
                  아이디
                  <input
                    type="text"
                    className={signupFieldErrors.username ? "fieldError" : ""}
                    value={signupUsername}
                    onChange={(e) => {
                      setSignupUsername(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, username: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder="아이디(3~24자)"
                  />
                  {signupFieldErrors.username && (
                    <span className="fieldErrorText">{signupFieldErrors.username}</span>
                  )}
                </label>
                <label>
                  닉네임
                  <input
                    type="text"
                    className={signupFieldErrors.nickname ? "fieldError" : ""}
                    value={signupNickname}
                    onChange={(e) => {
                      setSignupNickname(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, nickname: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder="닉네임"
                  />
                  {signupFieldErrors.nickname && (
                    <span className="fieldErrorText">{signupFieldErrors.nickname}</span>
                  )}
                </label>
                <label>
                  비밀번호
                  <input
                    type="password"
                    className={signupFieldErrors.password ? "fieldError" : ""}
                    value={signupPassword}
                    onChange={(e) => {
                      setSignupPassword(e.target.value);
                      setSignupFieldErrors((prev) => ({ ...prev, password: "" }));
                      if (signupError) setSignupError("");
                    }}
                    placeholder="영문+숫자 포함 8자 이상"
                  />
                  {signupFieldErrors.password && (
                    <span className="fieldErrorText">{signupFieldErrors.password}</span>
                  )}
                </label>
                {signupError && <div className="modalError">{signupError}</div>}
                <div className="modalActions">
                  <button onClick={backToMenu}>취소</button>
                  <button
                    onClick={signup}
                    disabled={isLoading || !signupUsername.trim() || !signupNickname.trim() || !signupPassword}
                  >
                    {isLoading ? "가입 중..." : "회원가입"}
                  </button>
                </div>
              </div>
            )}
          </div>
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
            <button className="singleSfxBtn" onClick={handleToggleSfx}>
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />} SOUND {soundOn ? "ON" : "OFF"}
            </button>
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
                {tutorialAllDone ? "완성!" : tutorialCurrentTask?.prompt}
              </div>
              <div className="tutorialStageActions">
                <button onClick={startTutorialMode}>다시 시작</button>
                <button onClick={skipTutorial}>건너뛰기</button>
                <button onClick={backToMenu}>종료</button>
              </div>
            </div>
          </section>
        )}

        {isModePvp && (
          <>
            {!isLoggedIn && (
              <div className="raceStateBox">
                <div>오른쪽 상단에서 로그인 후 PvP 매칭을 이용하세요.</div>
              </div>
            )}
            {isLoggedIn && !isInRaceRoom && (
              <section className="pvpQueuePanel">
                <div className="pvpQueueTitle">RANKED PVP MATCH</div>
                <div className="pvpQueueDesc">랜덤 사이즈(5x5/10x10/15x15/20x20/25x25) 중 1개로 매칭됩니다.</div>
                <div className="pvpQueueState">
                  {pvpServerState === "matching" && pvpMatchState === "accept" && "매칭 성사 - 수락 대기"}
                  {pvpServerState === "matching" && pvpMatchState === "ban" && "퍼즐 밴 단계"}
                  {pvpServerState === "matching" && pvpMatchState === "reveal" && "최종 퍼즐 추첨 중"}
                  {pvpServerState === "matching" && !pvpMatchState && "상대 탐색 중"}
                  {pvpServerState === "waiting" && `매칭 중... 대기열 ${pvpQueueSize}명`}
                  {pvpServerState === "cancelled" && "매칭 취소됨"}
                  {pvpServerState === "idle" && "대기 중"}
                </div>

                {pvpMatchState === "accept" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">수락을 눌러야 게임이 시작됩니다</div>
                    <div className="pvpGaugeWrap">
                      <div className="pvpGaugeFill" style={{ width: `${pvpAcceptPercent}%` }} />
                    </div>
                    <div className="pvpDeadlineText">{(pvpAcceptLeftMs / 1000).toFixed(1)}s</div>
                    <div className="pvpAcceptPlayers">
                      {(pvpMatch?.players || []).map((p) => (
                        <div key={p.userId} className={`pvpAcceptPlayer ${p.accepted ? "accepted" : ""}`}>
                          <span>{p.nickname}</span>
                          <span>{p.accepted ? "수락 완료" : "대기 중"}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="singleActionBtn"
                      onClick={acceptPvpMatch}
                      disabled={pvpAcceptBusy || pvpMatch?.me?.accepted === true}
                    >
                      {pvpMatch?.me?.accepted ? "ACCEPTED" : pvpAcceptBusy ? "처리중..." : "ACCEPT MATCH"}
                    </button>
                  </div>
                )}

                {pvpMatchState === "ban" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">5개 유형 중 1개를 밴하거나 스킵하세요</div>
                    <div className="pvpGaugeWrap ban">
                      <div className="pvpGaugeFill" style={{ width: `${pvpBanPercent}%` }} />
                    </div>
                    <div className="pvpDeadlineText">{(pvpBanLeftMs / 1000).toFixed(1)}s</div>
                    <div className="pvpBanGrid">
                      {(pvpOptions.length
                        ? pvpOptions
                        : PVP_SIZE_KEYS.map((k) => ({ sizeKey: k, bannedByNicknames: [], banned: false }))
                      ).map((option) => {
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
                      {pvpMatch?.me?.banSubmitted ? "제출 완료" : "SKIP BAN"}
                    </button>
                  </div>
                )}

                {pvpMatchState === "reveal" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">밴 제외 유형 중 랜덤 추첨</div>
                    <div className="pvpRevealTrack">
                      {(pvpOptions.length
                        ? pvpOptions
                        : PVP_SIZE_KEYS.map((k) => ({ sizeKey: k, bannedByNicknames: [], banned: false }))
                      ).map((option, idx) => {
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
                        ? `선택됨: ${pvpMatch.chosenSizeKey}`
                        : "결정 중..."}
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
                  <button className="singleHomeBtn" onClick={() => cancelPvpQueue()} disabled={!pvpSearching}>
                    CANCEL
                  </button>
                  <button className="singleSfxBtn" onClick={backToMenu}>
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
                  <button className="lobbyQuickBtn" onClick={handleToggleSfx}>
                    {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />} SOUND ON/OFF
                  </button>
                  <button className="lobbyQuickBtn" onClick={backToMenu}>
                    <Home size={18} /> HOME
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
                    CREATE ROOM
                  </button>

                  <div className="lobbyCardBtn join">
                    <div className="lobbyJoinTitle">JOIN ROOM</div>
                    <div className="lobbyJoinRow">
                      <input
                        type="text"
                        value={joinRoomCode}
                        onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                        placeholder="Enter room code"
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
                        JOIN
                      </button>
                    </div>
                  </div>

                  <button className="lobbyCardBtn refresh" onClick={fetchPublicRooms} disabled={roomsLoading}>
                    {roomsLoading ? "REFRESHING..." : "REFRESH LIST"}
                  </button>
                </div>
              </div>
            )}

            {!isLoggedIn && (
              <div className="raceStateBox">
                <div>오른쪽 상단에서 로그인 후 멀티플레이를 이용하세요.</div>
              </div>
            )}

            {isLoggedIn && isInRaceRoom && (
              <div className="racePanel">
                <button onClick={leaveRace} disabled={!raceRoomCode}>
                  Leave Room
                </button>
              </div>
            )}
          </>
        )}

        {isModeMulti && isLoggedIn && !isInRaceRoom && (
          <div className="lobbyTableWrap" data-tutorial="lobby-table">
            <div className="lobbyTableTitle">ROOM LIST</div>
            {publicRooms.length === 0 ? (
              <div className="lobbyEmpty">입장 가능한 방이 없습니다.</div>
            ) : (
              <table className="lobbyTable">
                <thead>
                  <tr>
                    <th>Room Code</th>
                    <th>Title</th>
                    <th>Size</th>
                    <th>Players</th>
                    <th>Status</th>
                    <th>Action</th>
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
                            Private <Lock size={14} />
                          </span>
                        ) : (
                          "Open"
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
                          Join
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
              <div className="raceInfoTitle">경기 상태: {isRacePlaying ? "진행 중" : racePhase}</div>
              <div>Room: <b>{roomTitleText || raceRoomCode}</b></div>
              <div>Code: <b>{raceRoomCode}</b></div>
              <div>Players: {(raceState?.players || []).length}/{raceState?.maxPlayers || 2}</div>
              {myRacePlayer && <div className="raceInfoMe">{myRacePlayer.nickname}</div>}
              <div className="timerBar">TIME {formattedTime}</div>
              <div className="raceActions">
                {isModeMulti && isRaceLobby && (
                  <>
                    <button onClick={() => setReady(!(myRacePlayer?.isReady === true))} disabled={!myRacePlayer}>
                      {myRacePlayer?.isReady ? "Unready" : "Ready"}
                    </button>
                    <button onClick={startRace} disabled={raceState?.hostPlayerId !== racePlayerId || !raceState?.canStart}>
                      Start (Host)
                    </button>
                  </>
                )}
                <button onClick={leaveRace} disabled={!raceRoomCode}>Leave</button>
                {isModeMulti && isRaceFinished && (
                  <button onClick={requestRematch} disabled={isRematchLoading}>
                    {isRematchLoading ? "준비중..." : "한판 더?"}
                  </button>
                )}
              </div>
            </aside>

            <div className="raceBoardPane">
              <div className="boardWrap" onContextMenu={(e) => e.preventDefault()}>
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
                          return (
                            <button key={hintId} type="button" className={`hintNum ${activeHints.has(hintId) ? "active" : ""}`} onClick={() => toggleHint(hintId)}>
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
                          return (
                            <button key={hintId} type="button" className={`hintNum ${activeHints.has(hintId) ? "active" : ""}`} onClick={() => toggleHint(hintId)}>
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
                    {isRaceCountdown && <div className="countdownOverlay">{countdownLeft ?? 0}</div>}
                    {isRaceLobby && <div className="countdownOverlay wait">READY 대기</div>}
                    {isRaceFinished && <div className="countdownOverlay result">{raceResultText}</div>}
                  </div>
                </div>
              </div>
              <div className="singleTools">
                <button className="toolBtn toolUndo" onClick={undo} disabled={!canUndo || !canInteractBoard}>UNDO</button>
                <button className="toolBtn toolRedo" onClick={redo} disabled={!canRedo || !canInteractBoard}>REDO</button>
                <button className="toolBtn toolClear" onClick={resetGrid} disabled={!canInteractBoard}>CLEAR</button>
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
                  return (
                    <div
                      key={p.playerId}
                      className="raceProgressRow"
                      ref={(el) => {
                        if (el) playerBadgeRefs.current.set(p.playerId, el);
                        else playerBadgeRefs.current.delete(p.playerId);
                      }}
                    >
                      <button
                        className="nickBtn"
                        onClick={() => {
                          if (p.playerId === racePlayerId) return;
                          setReactionMenuForPlayerId((prev) => (prev === p.playerId ? "" : p.playerId));
                        }}
                        disabled={p.playerId === racePlayerId}
                      >
                        {p.nickname}
                      </button>
                      <span>{percent}%</span>
                      {reactionMenuForPlayerId === p.playerId && (
                        <span className="reactionMenu">
                          <button onClick={() => sendReaction(p.playerId, "💩")}>💩</button>
                          <button onClick={() => sendReaction(p.playerId, "👍")}>👍</button>
                          <button onClick={() => sendReaction(p.playerId, "❤️")}>❤️</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="reactionLayer">
                {reactionFlights.map((f) => (
                  <span key={f.id} className="reactionFlight" style={{ left: `${f.x}px`, top: `${f.y}px`, opacity: f.opacity, "--flight-scale": f.scale }}>
                    {f.emoji}
                  </span>
                ))}
              </div>

              <div className="chatBox">
                <div className="chatTitle">Room Chat</div>
                <div className="chatBody" ref={chatBodyRef}>
                  {chatMessages.length === 0 ? (
                    <div className="chatEmpty">아직 채팅이 없습니다.</div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div className="chatMsg" key={msg.id}>
                        <b>{msg.nickname}</b>: {msg.text}
                      </div>
                    ))
                  )}
                </div>
                <div className="chatInputRow">
                  <div className="emojiWrap" ref={emojiWrapRef}>
                    <button type="button" onClick={() => setShowEmojiPicker((prev) => !prev)} title="이모지">🙂</button>
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
                    placeholder="메시지 입력..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendRaceChat();
                      }
                    }}
                  />
                  <button onClick={sendRaceChat} disabled={chatSending || !chatInput.trim()}>{chatSending ? "..." : "전송"}</button>
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
            <div className="singleTimer">TIMER: {formattedTime}</div>
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

        {showCreateModal && (
          <div className="modalBackdrop" onClick={() => setShowCreateModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>방 만들기</h2>
              <label>
                퍼즐 유형
                <select value={createSize} onChange={(e) => setCreateSize(e.target.value)}>
                  <option value="5x5">5x5</option>
                  <option value="10x10">10x10</option>
                  <option value="15x15">15x15</option>
                  <option value="20x20">20x20</option>
                  <option value="25x25">25x25</option>
                </select>
              </label>
              <label>
                최대 인원
                <select value={createMaxPlayers} onChange={(e) => setCreateMaxPlayers(e.target.value)}>
                  <option value="2">2명</option>
                  <option value="3">3명</option>
                  <option value="4">4명</option>
                </select>
              </label>
              <label>
                방 공개 설정
                <select value={createVisibility} onChange={(e) => setCreateVisibility(e.target.value)}>
                  <option value="public">오픈방</option>
                  <option value="private">비밀방</option>
                </select>
              </label>
              {createVisibility === "private" && (
                <label>
                  비밀번호
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="비밀번호"
                  />
                </label>
              )}
              <label>
                방 제목
                <input
                  type="text"
                  value={createRoomTitle}
                  onChange={(e) => setCreateRoomTitle(e.target.value)}
                  placeholder="예: 10x10 스피드전"
                />
              </label>
              <div className="modalActions">
                <button onClick={() => setShowCreateModal(false)}>취소</button>
                <button onClick={createRaceRoom} disabled={isLoading}>
                  {isLoading ? "생성중..." : "생성"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div className="modalBackdrop" onClick={() => setShowJoinModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>방 참가</h2>
              {joinModalSource === "manual" && (
                <label>
                  방 코드
                  <input
                    type="text"
                    value={joinRoomCode}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      setJoinRoomCode(code);
                      const matched = publicRooms.find((r) => r.roomCode === code);
                      setJoinRoomType(matched ? (matched.isPrivate ? "private" : "public") : "unknown");
                    }}
                    placeholder="예: AB12CD"
                  />
                </label>
              )}
              {joinRoomType !== "public" && (
                <label>
                  비밀번호(비밀방만)
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="비밀방 비밀번호"
                  />
                </label>
              )}
              <div className="modalActions">
                <button onClick={() => setShowJoinModal(false)}>취소</button>
                <button
                  onClick={joinRaceRoom}
                  disabled={
                    isLoading ||
                    (joinModalSource === "manual" && !joinRoomCode.trim()) ||
                    (joinRoomType !== "public" && !joinPassword.trim())
                  }
                >
                  {isLoading ? "참가중..." : "참가"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showNeedLoginPopup && (
          <div className="modalBackdrop" onClick={() => setShowNeedLoginPopup(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <h2>로그인 필요</h2>
              <p>{needLoginReturnMode === "pvp" ? "PVP 매칭은 로그인 후 이용 가능합니다." : "멀티플레이는 로그인 후 이용 가능합니다."}</p>
              <div className="modalActions">
                <button onClick={() => setShowNeedLoginPopup(false)}>취소</button>
                <button
                  onClick={() => {
                    setShowNeedLoginPopup(false);
                    openAuthScreen("login", needLoginReturnMode);
                  }}
                >
                  로그인하러 가기
                </button>
              </div>
            </div>
          </div>
        )}

        {shouldShowPuzzleBoard && !isInRaceRoom && (
          <div
            className="boardWrap"
            onContextMenu={(e) => e.preventDefault()}
            data-tutorial={isSingleSoloMode ? "single-board" : undefined}
          >
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
                      return (
                        <button
                          key={hintId}
                          type="button"
                          className={`hintNum ${activeHints.has(hintId) ? "active" : ""}`}
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
                      return (
                        <button
                          key={hintId}
                          type="button"
                          className={`hintNum ${activeHints.has(hintId) ? "active" : ""}`}
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
                {isRaceLobby && <div className="countdownOverlay wait">READY 대기</div>}
                {isRaceFinished && <div className="countdownOverlay result">{raceResultText}</div>}
              </div>
            </div>
          </div>
        )}

      </motion.section>
    </main>
  );
}

export default App;





