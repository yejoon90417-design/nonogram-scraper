import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { motion } from "framer-motion";
import { Eraser, LogIn, Redo2, Undo2, UserPlus, Volume2, VolumeX } from "lucide-react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const MAX_HISTORY = 200;
const AUTH_TOKEN_KEY = "nonogram-auth-token";
const AUTH_USER_KEY = "nonogram-auth-user";
const POOP_SFX_URL = `${import.meta.env.BASE_URL}sounds/poot.mp3`;

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
  const [playMode, setPlayMode] = useState("menu"); // menu | single | multi | auth
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
  const deferredCells = useDeferredValue(cells);

  useEffect(() => {
    cellValuesRef.current = cells;
  }, [cells]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (racePollRef.current) clearInterval(racePollRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
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
  const isModeAuth = playMode === "auth";
  const isLoggedIn = Boolean(authToken && authUser);
  const isInRaceRoom = Boolean(raceRoomCode);
  const shouldShowPuzzleBoard = Boolean(
    puzzle && ((isModeSingle && !isInRaceRoom) || (isModeMulti && isInRaceRoom))
  );
  const racePhase = raceState?.state || "idle";
  const isRaceLobby = isInRaceRoom && racePhase === "lobby";
  const isRaceCountdown = isInRaceRoom && racePhase === "countdown";
  const isRacePlaying = isInRaceRoom && racePhase === "playing";
  const isRaceFinished = isInRaceRoom && racePhase === "finished";

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

  const initializePuzzle = (p, { resume = true, message = "", startTimer = true } = {}) => {
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
    setStatus(message || `Puzzle ${p.id} loaded.`);
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

  const goSingleMode = () => {
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
      setShowNeedLoginPopup(true);
      return;
    }
    setPlayMode("multi");
    setStatus("");
  };

  const backToMenu = async () => {
    if (isInRaceRoom) {
      setStatus("멀티 방에서는 먼저 Leave Room을 눌러줘.");
      return;
    }
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
      setPlayMode(authReturnMode === "multi" ? "multi" : "menu");
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
      setPlayMode(authReturnMode === "multi" ? "multi" : "menu");
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

  const leaveRace = async () => {
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

  const pollRaceRoom = async (roomCode) => {
    if (!roomCode) return;
    try {
      const res = await fetch(`${API_BASE}/race/${roomCode}`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) return;
      applyRaceRoomState(data.room);
    } catch {
      // ignore intermittent poll errors
    }
  };

  const startRacePolling = (roomCode) => {
    if (racePollRef.current) clearInterval(racePollRef.current);
    pollRaceRoom(roomCode);
    racePollRef.current = window.setInterval(() => {
      pollRaceRoom(roomCode);
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
      startRacePolling(data.roomCode);
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const joinRaceRoom = async () => {
    const code = joinRoomCode.trim().toUpperCase();
    const password = joinPassword.trim();
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
      startRacePolling(data.roomCode);
      setJoinPassword("");
      setShowJoinModal(false);
      playSfx("ui");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
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
    if (!isInRaceRoom || (!isRaceCountdown && !isRacePlaying)) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [isInRaceRoom, isRaceCountdown, isRacePlaying]);

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
      if (isInRaceRoom && isRacePlaying) {
        setStatus("완주! 다른 플레이어 결과 대기중...");
      } else {
        setStatus("Success! Puzzle solved.");
      }
      submitRaceFinish();
    }
    if (!isBoardCompleteByHints) {
      autoSolvedShownRef.current = false;
    }
  }, [isBoardCompleteByHints, puzzle, isInRaceRoom, isRacePlaying]);

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
    if (isInRaceRoom) return;
    fetchPublicRooms();
  }, [isInRaceRoom]);

  useEffect(() => {
    if (isInRaceRoom) return;
    if (isRaceOnlyStatusMessage(status)) {
      setStatus("");
    }
  }, [isInRaceRoom, status]);

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
          <div>
            <h1 className="title">Nonogram Arena</h1>
            <p className="lead">드래그로 그리는 타임어택 픽셀 전투. 싱글 연습 후 멀티에서 경쟁하세요.</p>
          </div>
          {!isModeAuth && (
            <div className="topAuth">
              {isLoggedIn ? (
                <>
                  <span className="userChip">
                    {authUser.nickname} ({authUser.username})
                  </span>
                  <button onClick={logout}>로그아웃</button>
                </>
              ) : (
                <>
                  <button onClick={() => openAuthScreen("login", "menu")}>
                    <LogIn size={15} /> 로그인
                  </button>
                  <button onClick={() => openAuthScreen("signup", "menu")}>
                    <UserPlus size={15} /> 회원가입
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isModeMenu && (
          <div className="modeChooser">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="modeBtn modeSingle"
              onClick={goSingleMode}
            >
              <span className="modeName">싱글플레이</span>
              <span className="modeDesc">랜덤 퍼즐 연습 모드</span>
            </motion.button>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="modeBtn modeMulti"
              onClick={goMultiMode}
            >
              <span className="modeName">멀티플레이</span>
              <span className="modeDesc">방 생성/참가 실시간 대결</span>
            </motion.button>
          </div>
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
          <div className="controls">
            {!isInRaceRoom && (
              <>
                <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                  <option value="5x5">5x5</option>
                  <option value="10x10">10x10</option>
                  <option value="15x15">15x15</option>
                  <option value="25x25">25x25</option>
                </select>
                <button onClick={loadRandomBySize} disabled={isLoading}>
                  {isLoading ? "Loading..." : "Load Random Size"}
                </button>
              </>
            )}
            <button onClick={handleToggleSfx}>
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {soundOn ? "SFX ON" : "SFX OFF"}
            </button>
            <button onClick={backToMenu} disabled={isInRaceRoom}>
              메인으로
            </button>
          </div>
        )}

        {isModeMulti && (
          <>
            <div className="controls">
              <button onClick={handleToggleSfx}>
                {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {soundOn ? "SFX ON" : "SFX OFF"}
              </button>
              <button onClick={backToMenu} disabled={isInRaceRoom}>
                메인으로
              </button>
            </div>

            {!isLoggedIn && (
              <div className="raceStateBox">
                <div>오른쪽 상단에서 로그인 후 멀티플레이를 이용하세요.</div>
              </div>
            )}

            {isLoggedIn && (
              <div className="racePanel">
                {!isInRaceRoom && (
                  <>
                    <button
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
                      방 만들기
                    </button>
                    <button
                      onClick={() => {
                        setJoinRoomType("unknown");
                        setJoinPassword("");
                        setShowJoinModal(true);
                      }}
                      disabled={isLoading}
                    >
                      Join Room
                    </button>
                    <button onClick={fetchPublicRooms} disabled={roomsLoading}>
                      {roomsLoading ? "목록 불러오는 중..." : "오픈방 새로고침"}
                    </button>
                  </>
                )}
                <button onClick={leaveRace} disabled={!raceRoomCode}>
                  Leave Room
                </button>
              </div>
            )}
          </>
        )}

        {isModeMulti && isLoggedIn && !isInRaceRoom && (
          <div className="raceStateBox">
            <div><b>방 리스트</b></div>
            {publicRooms.length === 0 ? (
              <div>입장 가능한 방이 없습니다.</div>
            ) : (
              <div className="roomList">
                {publicRooms.map((room) => (
                  <div className="roomRow" key={room.roomCode}>
                    <span>
                      <span className={`roomBadge ${room.isPrivate ? "private" : "public"}`}>
                        {room.isPrivate ? "LOCK" : "OPEN"}
                      </span>{" "}
                      [{room.roomCode}] {room.roomTitle} ({room.width}x{room.height}) {room.currentPlayers}/
                      {room.maxPlayers}
                    </span>
                    <button
                      onClick={() => {
                        setJoinRoomCode(room.roomCode);
                        setJoinRoomType(room.isPrivate ? "private" : "public");
                        setJoinPassword("");
                        setShowJoinModal(true);
                      }}
                    >
                      참가
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isModeMulti && isLoggedIn && raceRoomCode && (
          <div className="raceStateBox">
            <div>
              Room: <b>{raceRoomCode}</b>
            </div>
            {roomTitleText && (
              <div>
                Title: <b>{roomTitleText}</b>
              </div>
            )}
            <div>
              Players: {(raceState?.players || []).length}/{raceState?.maxPlayers || 2}
            </div>
            <div>State: {racePhase}</div>
            <div>Submit: {raceSubmitting ? "Sending..." : "Idle"}</div>
            {myRacePlayer && <div>Me: {myRacePlayer.nickname}</div>}
            {isRaceLobby && (
              <div className="raceActions">
                <button
                  onClick={() => setReady(!(myRacePlayer?.isReady === true))}
                  disabled={!myRacePlayer}
                >
                  {myRacePlayer?.isReady ? "Unready" : "Ready"}
                </button>
                <button
                  onClick={startRace}
                  disabled={raceState?.hostPlayerId !== racePlayerId || !raceState?.canStart}
                >
                  Start (Host)
                </button>
              </div>
            )}
            {isRaceFinished && raceResultText && <div className="raceResult">{raceResultText}</div>}
            {isRaceFinished && (
              <div className="raceActions">
                <button onClick={requestRematch} disabled={isRematchLoading}>
                  {isRematchLoading ? "준비중..." : "한판 더?"}
                </button>
              </div>
            )}
            {isRaceFinished && Array.isArray(raceState?.rankings) && raceState.rankings.length > 0 && (
              <div className="rankings">
                <b>최종 순위</b>
                {raceState.rankings.map((r) => (
                  <div key={r.playerId}>
                    {r.rank ? `${r.rank}등` : "-"} {r.nickname}
                    {Number.isInteger(r.elapsedSec)
                      ? ` (${r.elapsedSec}s)`
                      : r.status === "left"
                        ? " (중도 이탈)"
                        : " (미완주)"}
                  </div>
                ))}
              </div>
            )}
            <div className="racePlayers">
              {(raceState?.players || []).map((p) => (
                <span
                  key={p.playerId}
                  className="playerBadge"
                  ref={(el) => {
                    if (el) playerBadgeRefs.current.set(p.playerId, el);
                    else playerBadgeRefs.current.delete(p.playerId);
                  }}
                >
                  <span className="nameWrap">
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
                    {reactionMenuForPlayerId === p.playerId && (
                      <span className="reactionMenu">
                        <button onClick={() => sendReaction(p.playerId, "💩")}>💩</button>
                        <button onClick={() => sendReaction(p.playerId, "👍")}>👍</button>
                        <button onClick={() => sendReaction(p.playerId, "❤️")}>❤️</button>
                      </span>
                    )}
                  </span>
                  <span className="playerStateText">
                    {raceState?.hostPlayerId === p.playerId ? " [host]" : ""}
                    {p.disconnectedAt ? " [left]" : p.isReady ? " [ready]" : " [not ready]"}:
                    {p.playerId === racePlayerId
                      ? Number.isInteger(p.elapsedSec)
                        ? " 완료 (대기중)"
                        : " 플레이 중"
                      : p.disconnectedAt
                        ? " 중도 이탈"
                      : Number.isInteger(p.elapsedSec)
                        ? ` ${p.elapsedSec}s`
                        : ` 남은 정답칸 ${Math.max(0, Number(p.remainingAnswerCells || 0))}`}
                  </span>
                </span>
              ))}
            </div>
            <div className="reactionLayer">
              {reactionFlights.map((f) => (
                <span
                  key={f.id}
                  className="reactionFlight"
                  style={{
                    left: `${f.x}px`,
                    top: `${f.y}px`,
                    opacity: f.opacity,
                    "--flight-scale": f.scale,
                  }}
                >
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
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title="이모지"
                  >
                    🙂
                  </button>
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
                <button onClick={sendRaceChat} disabled={chatSending || !chatInput.trim()}>
                  {chatSending ? "..." : "전송"}
                </button>
              </div>
            </div>
          </div>
        )}

        {shouldShowPuzzleBoard && <div className="timerBar">TIME {formattedTime}</div>}
        {shouldShowPuzzleBoard && (
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
                <button onClick={joinRaceRoom} disabled={isLoading || !joinRoomCode.trim()}>
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
              <p>멀티플레이는 로그인 후 이용 가능합니다.</p>
              <div className="modalActions">
                <button onClick={() => setShowNeedLoginPopup(false)}>취소</button>
                <button
                  onClick={() => {
                    setShowNeedLoginPopup(false);
                    openAuthScreen("login", "multi");
                  }}
                >
                  로그인하러 가기
                </button>
              </div>
            </div>
          </div>
        )}

        {shouldShowPuzzleBoard && (
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
                    className="rowHintRow"
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





