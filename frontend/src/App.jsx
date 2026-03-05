import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { motion } from "framer-motion";
import { ChevronDown, Eraser, Home, Lock, LogIn, Redo2, Trophy, Undo2, User, UserPlus, Volume2, VolumeX } from "lucide-react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://nonogram-api.onrender.com").replace(/\/$/, "");
const MAX_HISTORY = 200;
const AUTH_TOKEN_KEY = "nonogram-auth-token";
const AUTH_USER_KEY = "nonogram-auth-user";
const LANG_KEY = "nonogram-ui-lang";
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
    message === "5초 후 시작합니다." ||
    message === "Victory." ||
    message === "Defeat." ||
    message === "Finished! Waiting for other players..." ||
    message === "Starting in 5 seconds."
  );
}

function App() {
  const [playMode, setPlayMode] = useState("menu"); // menu | single | multi | pvp | tutorial | auth | ranking
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
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "en" ? "en" : "ko";
  });
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
  const [pvpRatingFx, setPvpRatingFx] = useState(null);
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
  const pvpRatingAnimRef = useRef(0);
  const pvpRatingBaseRef = useRef(null);
  const pvpRatingBaseGamesRef = useRef(null);
  const pvpRatingFxDoneRoomRef = useRef("");
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
  const L = (ko, en) => (lang === "ko" ? ko : en);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

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
  const isModeRanking = playMode === "ranking";
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
      setPlayMode(authReturnMode === "multi" || authReturnMode === "pvp" ? authReturnMode : "menu");
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
      setPlayMode(authReturnMode === "multi" || authReturnMode === "pvp" ? authReturnMode : "menu");
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

  const fetchRatingUsers = async () => {
    setRatingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ratings/leaderboard?limit=200`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || L("랭킹 조회 실패", "Failed to load ranking"));
      setRatingUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setRatingLoading(false);
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

  const startPvpRatingAnimation = (fromRating, toRating, roomCode) => {
    stopPvpRatingAnimation();
    const from = Number(fromRating);
    const to = Number(toRating);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const delta = to - from;
    const duration = 1850;
    const startAt = performance.now();

    setPvpRatingFx({
      roomCode,
      from,
      to,
      delta,
      ratingNow: from,
      deltaNow: 0,
      done: false,
    });
    playSfx("ui");

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
        playSfx(delta >= 0 ? "rank-up" : "rank-down");
      }
    };

    pvpRatingAnimRef.current = requestAnimationFrame(tick);
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
    pvpMatchPhaseRef.current = "";
    pvpRatingBaseRef.current = null;
    pvpRatingBaseGamesRef.current = null;
    pvpRatingFxDoneRoomRef.current = "";
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
    pvpMatchPhaseRef.current = "";
    pvpRatingBaseRef.current = Number(authUser?.rating ?? 1500);
    pvpRatingBaseGamesRef.current = Number(authUser?.rating_games ?? 0);
    pvpRatingFxDoneRoomRef.current = "";
    if (data.ticketId) setPvpTicketId(data.ticketId);
    setRaceRoomCode(data.roomCode);
    setRacePlayerId(data.playerId);
    applyRaceRoomState(data.room, data.playerId);
    initializePuzzle(data.puzzle, {
      resume: false,
      startTimer: false,
      message: L("매칭 성공! 5초 카운트다운 후 시작됩니다.", "Match found! Starting after a 5-second countdown."),
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
          ? L("매칭 성사! 수락 버튼을 눌러주세요.", "Match found! Press accept.")
          : L("상대를 찾는 중...", "Searching for opponent...")
      );
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
      if (!res.ok || !data.ok) throw new Error(data.error || L("리액션 전송 실패", "Failed to send reaction"));
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
        setStatus(L("완주! 다른 플레이어 결과 대기중...", "Finished! Waiting for other players..."));
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
      setStatus(L("승리하였습니다.", "Victory."));
      playSfx("win");
    } else {
      setStatus(L("패배하였습니다.", "Defeat."));
      setTimerRunning(false);
      playSfx("lose");
    }
  }, [isInRaceRoom, racePhase, raceState, racePlayerId]);

  useEffect(() => {
    if (!isLoggedIn || !isModePvp || !isInRaceRoom || racePhase !== "finished") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { ...authHeaders } });
        const data = await parseJsonSafe(res);
        if (!cancelled && res.ok && data.ok && data.user) {
          setAuthUser(data.user);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        }
      } catch {
        // ignore post-match auth refresh errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isModePvp, isInRaceRoom, racePhase, authHeaders]);

  useEffect(() => {
    if (!isLoggedIn || !isModePvp || !isInRaceRoom || racePhase !== "finished" || !raceRoomCode) return;
    if (pvpRatingFxDoneRoomRef.current === raceRoomCode) return;
    const fromRating = Number(pvpRatingBaseRef.current);
    const fromGames = Number(pvpRatingBaseGamesRef.current);
    const toRating = Number(authUser?.rating);
    const toGames = Number(authUser?.rating_games);
    if (!Number.isFinite(fromRating) || !Number.isFinite(fromGames)) return;
    if (!Number.isFinite(toRating) || !Number.isFinite(toGames)) return;
    if (toGames <= fromGames) return;
    pvpRatingFxDoneRoomRef.current = raceRoomCode;
    startPvpRatingAnimation(fromRating, toRating, raceRoomCode);
  }, [isLoggedIn, isModePvp, isInRaceRoom, racePhase, raceRoomCode, authUser?.rating, authUser?.rating_games]);

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
    if (!isModeRanking || isInRaceRoom) return;
    fetchRatingUsers();
  }, [isModeRanking, isInRaceRoom]);

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
        className={`panel ${isModeMenu || isModeAuth ? "panelMenu" : ""} ${lang === "en" ? "langEn" : "langKo"}`}
      >
        <div className="topBar">
          <div className="brandWrap">
            <div className="logoPixel" aria-hidden="true" />
            <h1 className="title">Nonogram Arena</h1>
          </div>
          {!isModeAuth && (
            <div className="topAuth">
              <div className="langSwitch" role="group" aria-label="Language switch">
                <button type="button" className={lang === "ko" ? "active" : ""} onClick={() => setLang("ko")}>
                  KO
                </button>
                <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
                  EN
                </button>
              </div>
              {isLoggedIn ? (
                <>
                  <span className="userChip">
                    {authUser.nickname} ({authUser.username}) · R {Number(authUser.rating || 1500)}
                  </span>
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
                {!isLoggedIn && <span className="modeTag">{L("로그인 필요", "Login Required")}</span>}
                <span className="modeName">MULTI PLAYER</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="modeBtn modePvp"
                onClick={goPvpMode}
              >
                {!isLoggedIn && <span className="modeTag">{L("로그인 필요", "Login Required")}</span>}
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
              <div className="authCard">
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
                  <button onClick={backToMenu}>{L("취소", "Cancel")}</button>
                  <button onClick={login} disabled={isLoading || !loginUsername.trim() || !loginPassword}>
                    {isLoading ? L("로그인 중...", "Logging in...") : L("로그인", "Login")}
                  </button>
                </div>
              </div>
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
                        "본 서비스는 논노그램 게임 이용을 위한 서비스이며, 관련 법령과 운영 정책을 준수해야 합니다.",
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
                        "회원가입 시 아이디, 닉네임, 비밀번호(해시 처리)를 수집하며, 경기 기록과 채팅 데이터가 저장될 수 있습니다.",
                        "At sign-up, username, nickname, and hashed password are collected. Match records and chat data may be stored."
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

        {isModeRanking && (
          <section className="rankingScreen">
            <div className="rankingTopBar">
              <div className="rankingTitle">
                <Trophy size={18} /> {L("레이팅 랭킹", "Rating Ranking")}
              </div>
              <div className="rankingActions">
                <button className="singleActionBtn" onClick={fetchRatingUsers} disabled={ratingLoading}>
                  {ratingLoading ? "LOADING..." : "REFRESH"}
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
                    <th>{L("레이팅", "Rating")}</th>
                    <th>{L("전적", "Record")}</th>
                    <th>{L("승률", "Win Rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="rankingEmpty">
                        {ratingLoading ? L("불러오는 중...", "Loading...") : L("표시할 유저가 없습니다.", "No users to display.")}
                      </td>
                    </tr>
                  ) : (
                    ratingUsers.map((u, idx) => {
                      const games = Number(u.rating_games || 0);
                      const wins = Number(u.rating_wins || 0);
                      const losses = Number(u.rating_losses || 0);
                      const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
                      return (
                        <tr key={u.id}>
                          <td>{idx + 1}</td>
                          <td>{u.nickname}</td>
                          <td className="ratingScore">{Number(u.rating || 1500)}</td>
                          <td>
                            {wins}W {losses}L ({games})
                          </td>
                          <td>{winRate}%</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
                <div className="pvpQueueDesc">
                  {L("랜덤 사이즈(5x5/10x10/15x15/20x20/25x25) 중 1개로 매칭됩니다.", "One random size is selected from 5x5/10x10/15x15/20x20/25x25.")}
                </div>
                <div className="pvpQueueState">
                  {pvpServerState === "matching" && pvpMatchState === "accept" && L("매칭 성사 - 수락 대기", "Match found - waiting for accept")}
                  {pvpServerState === "matching" && pvpMatchState === "ban" && L("퍼즐 밴 단계", "Puzzle ban phase")}
                  {pvpServerState === "matching" && pvpMatchState === "reveal" && L("최종 퍼즐 추첨 중", "Final puzzle roulette")}
                  {pvpServerState === "matching" && !pvpMatchState && L("상대 탐색 중", "Searching opponent")}
                  {pvpServerState === "waiting" && L(`매칭 중... 대기열 ${pvpQueueSize}명`, `Matching... queue ${pvpQueueSize}`)}
                  {pvpServerState === "cancelled" && L("매칭 취소됨", "Match cancelled")}
                  {pvpServerState === "idle" && L("대기 중", "Idle")}
                </div>

                {pvpMatchState === "accept" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">{L("수락을 눌러야 게임이 시작됩니다", "Press accept to start the game")}</div>
                    <div className="pvpGaugeWrap">
                      <div className="pvpGaugeFill" style={{ width: `${pvpAcceptPercent}%` }} />
                    </div>
                    <div className="pvpDeadlineText">{(pvpAcceptLeftMs / 1000).toFixed(1)}s</div>
                    <div className="pvpAcceptPlayers">
                      {(pvpMatch?.players || []).map((p) => (
                        <div key={p.userId} className={`pvpAcceptPlayer ${p.accepted ? "accepted" : ""}`}>
                          <span>{p.nickname}</span>
                          <span>{p.accepted ? L("수락 완료", "Accepted") : L("대기 중", "Waiting")}</span>
                        </div>
                      ))}
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

                {pvpMatchState === "ban" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">{L("5개 유형 중 1개를 밴하거나 스킵하세요", "Ban one of five types, or skip")}</div>
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
                      {pvpMatch?.me?.banSubmitted ? L("제출 완료", "Submitted") : "SKIP BAN"}
                    </button>
                  </div>
                )}

                {pvpMatchState === "reveal" && (
                  <div className="pvpStageCard">
                    <div className="pvpStageTitle">{L("밴 제외 유형 중 랜덤 추첨", "Random draw among unbanned types")}</div>
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
                    {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />} {L("사운드 ON/OFF", "SOUND ON/OFF")}
                  </button>
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
              {myRacePlayer && <div className="raceInfoMe">{myRacePlayer.nickname}</div>}
              <div className="timerBar">{L("시간", "TIME")} {formattedTime}</div>
              {isModePvp && isRaceFinished && pvpRatingFx && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className={`ratingFxCard ${pvpRatingFx.delta >= 0 ? "up" : "down"} ${pvpRatingFx.done ? "done" : ""}`}
                >
                  <div className="ratingFxHead">RATING UPDATE</div>
                  <div className="ratingFxNums">
                    <span className="old">{pvpRatingFx.from}</span>
                    <span className="arrow">→</span>
                    <span className="now">{pvpRatingFx.ratingNow}</span>
                  </div>
                  <div className={`ratingFxDelta ${pvpRatingFx.delta >= 0 ? "plus" : "minus"}`}>
                    {pvpRatingFx.deltaNow > 0 ? `+${pvpRatingFx.deltaNow}` : String(pvpRatingFx.deltaNow)}
                  </div>
                  <div className="ratingFxParticles" aria-hidden="true">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={`rating-p-${i}`}
                        style={{
                          "--rx": `${(i - 5.5) * 11}px`,
                          "--rd": `${0.22 + i * 0.035}s`,
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
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
                <button onClick={leaveRace} disabled={!raceRoomCode}>{L("나가기", "Leave")}</button>
                {isModeMulti && isRaceFinished && (
                  <button onClick={requestRematch} disabled={isRematchLoading}>
                    {isRematchLoading ? L("준비중...", "Preparing...") : L("한판 더?", "Rematch?")}
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
                    {isRaceLobby && <div className="countdownOverlay wait">{L("READY 대기", "Waiting for READY")}</div>}
                    {isRaceFinished && <div className="countdownOverlay result">{raceResultText}</div>}
                  </div>
                </div>
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
                <div className="chatTitle">{L("방 채팅", "Room Chat")}</div>
                <div className="chatBody" ref={chatBodyRef}>
                  {chatMessages.length === 0 ? (
                    <div className="chatEmpty">{L("아직 채팅이 없습니다.", "No chat yet.")}</div>
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
                    <button type="button" onClick={() => setShowEmojiPicker((prev) => !prev)} title={L("이모지", "Emoji")}>🙂</button>
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
                {isRaceLobby && <div className="countdownOverlay wait">{L("READY 대기", "Waiting for READY")}</div>}
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





