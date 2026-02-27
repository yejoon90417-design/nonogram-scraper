import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const MAX_HISTORY = 200;

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

function App() {
  const [puzzleId, setPuzzleId] = useState("1000575");
  const [selectedSize, setSelectedSize] = useState("25x25");
  const [puzzle, setPuzzle] = useState(null);
  const [cells, setCells] = useState([]); // 0 empty, 1 filled, 2 marked(X)
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [activeHints, setActiveHints] = useState(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [nickname, setNickname] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [raceRoomCode, setRaceRoomCode] = useState("");
  const [racePlayerId, setRacePlayerId] = useState("");
  const [raceState, setRaceState] = useState(null);
  const [raceSubmitting, setRaceSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createNickname, setCreateNickname] = useState("");
  const [createRoomTitle, setCreateRoomTitle] = useState("");
  const [createSize, setCreateSize] = useState("10x10");
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
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
  const deferredCells = useDeferredValue(cells);

  useEffect(() => {
    cellValuesRef.current = cells;
  }, [cells]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (racePollRef.current) clearInterval(racePollRef.current);
    };
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

  const progressText = useMemo(() => {
    if (!puzzle) return "";
    const rowDone = solvedRows.size;
    const colDone = solvedCols.size;
    return `Rows ${rowDone}/${puzzle.height}, Cols ${colDone}/${puzzle.width}`;
  }, [puzzle, solvedRows, solvedCols]);

  const formattedTime = useMemo(() => {
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [elapsedSec]);

  const isBoardCompleteByHints = useMemo(() => {
    if (!puzzle) return false;
    return solvedRows.size === puzzle.height && solvedCols.size === puzzle.width;
  }, [puzzle, solvedRows, solvedCols]);
  const isInRaceRoom = Boolean(raceRoomCode);
  const racePhase = raceState?.state || "idle";
  const isRaceLobby = isInRaceRoom && racePhase === "lobby";
  const isRaceCountdown = isInRaceRoom && racePhase === "countdown";
  const isRacePlaying = isInRaceRoom && racePhase === "playing";
  const isRaceFinished = isInRaceRoom && racePhase === "finished";
  const canInteractBoard = !isInRaceRoom || isRacePlaying;

  const myRacePlayer = useMemo(() => {
    if (!raceState || !racePlayerId) return null;
    return raceState.players?.find((p) => p.playerId === racePlayerId) || null;
  }, [raceState, racePlayerId]);

  const raceResultText = useMemo(() => {
    if (!raceState?.winner) return "";
    if (raceState.winner.playerId === racePlayerId) {
      return `승리하였습니다 (${raceState.winner.elapsedSec}s)`;
    }
    return `패배하였습니다 (승자: ${raceState.winner.nickname}, ${raceState.winner.elapsedSec}s)`;
  }, [raceState, racePlayerId]);
  const roomTitleText = raceState?.roomTitle || "";

  const countdownLeft = useMemo(() => {
    if (!isRaceCountdown || !raceState?.gameStartAt) return null;
    const ms = new Date(raceState.gameStartAt).getTime() - nowMs;
    return Math.max(0, Math.ceil(ms / 1000));
  }, [isRaceCountdown, raceState, nowMs]);

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
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(cellValuesRef.current.slice());
    applySnapshot(next.slice());
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
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
    setPuzzleId(String(p.id));
    setPuzzle(p);
    applySnapshot(initial);
    setActiveHints(new Set());
    resetHistory();
    autoSolvedShownRef.current = false;
    raceFinishedSentRef.current = false;
    raceResultShownRef.current = false;
    setElapsedSec(0);
    setTimerRunning(startTimer);
    setStatus(message || `Puzzle ${p.id} loaded.`);
  };

  const loadPuzzle = async () => {
    if (isInRaceRoom) {
      setStatus("You cannot change puzzle while in a race room.");
      return;
    }
    const id = Number(puzzleId);
    if (!Number.isInteger(id)) {
      setStatus("Enter a numeric puzzle ID.");
      return;
    }

    setIsLoading(true);
    setStatus("");

    try {
      const res = await fetch(`${API_BASE}/puzzles/${id}`);
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load puzzle.");
      }
      initializePuzzle(data.puzzle, { resume: true, message: `Puzzle ${data.puzzle.id} loaded.` });
    } catch (err) {
      setPuzzle(null);
      setCells([]);
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
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
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const leaveRace = () => {
    if (racePollRef.current) {
      clearInterval(racePollRef.current);
      racePollRef.current = 0;
    }
    setRaceRoomCode("");
    setRacePlayerId("");
    setRaceState(null);
    setRaceSubmitting(false);
    raceFinishedSentRef.current = false;
    raceResultShownRef.current = false;
    setTimerRunning(true);
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
    const name = createNickname.trim();
    const roomTitle = createRoomTitle.trim();
    if (!name) {
      setStatus("닉네임을 입력해줘.");
      return;
    }
    const [wStr, hStr] = createSize.split("x");
    const width = Number(wStr);
    const height = Number(hStr);
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      setStatus("Invalid size selection.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: name, roomTitle, width, height }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to create room.");
      setNickname(name);
      setRaceRoomCode(data.roomCode);
      setRacePlayerId(data.playerId);
      applyRaceRoomState(data.room, data.playerId);
      setRoomCodeInput(data.roomCode);
      setSelectedSize(createSize);
      setShowCreateModal(false);
      initializePuzzle(data.puzzle, {
        resume: false,
        startTimer: false,
        message: `Room ${data.roomCode} created. Wait for ready.`,
      });
      startRacePolling(data.roomCode);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const joinRaceRoom = async () => {
    const name = nickname.trim();
    const code = roomCodeInput.trim().toUpperCase();
    if (!name) {
      setStatus("Enter nickname first.");
      return;
    }
    if (!code) {
      setStatus("Enter room code first.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/race/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: name, roomCode: code }),
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
      }
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsRematchLoading(false);
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
  };

  const toggleHint = (hintId) => {
    setActiveHints((prev) => {
      const next = new Set(prev);
      if (next.has(hintId)) next.delete(hintId);
      else next.add(hintId);
      return next;
    });
  };

  const checkAnswer = async () => {
    if (!puzzle) return;
    setIsChecking(true);
    setStatus("");

    try {
      const userBitsBase64 = toBase64Bits(cells, puzzle.width, puzzle.height);
      const res = await fetch(`${API_BASE}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: puzzle.id, userBitsBase64 }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Verification failed.");
      }
      if (data.isCorrect) {
        setTimerRunning(false);
        submitRaceFinish();
      }
      setStatus(data.isCorrect ? "Correct." : "Not correct yet.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsChecking(false);
    }
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
      setStatus("Success! Puzzle solved.");
      submitRaceFinish();
    }
    if (!isBoardCompleteByHints) {
      autoSolvedShownRef.current = false;
    }
  }, [isBoardCompleteByHints, puzzle]);

  useEffect(() => {
    if (!isInRaceRoom || !raceState?.winnerPlayerId || raceResultShownRef.current) return;
    raceResultShownRef.current = true;
    if (raceState.winnerPlayerId === racePlayerId) {
      setStatus("승리하였습니다.");
    } else {
      setStatus("패배하였습니다.");
      setTimerRunning(false);
    }
  }, [isInRaceRoom, raceState, racePlayerId]);

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

  return (
    <main className="page">
      <section className="panel">
        <h1>Nonogram Verifier</h1>
        <p>Left drag: fill, Right drag: mark X, click hints to toggle highlight.</p>

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
              <input
                type="number"
                value={puzzleId}
                onChange={(e) => setPuzzleId(e.target.value)}
                placeholder="Puzzle ID"
              />
              <button onClick={loadPuzzle} disabled={isLoading}>
                {isLoading ? "Loading..." : "Load Puzzle"}
              </button>
            </>
          )}
          <button onClick={checkAnswer} disabled={!puzzle || isChecking || !canInteractBoard}>
            {isChecking ? "Checking..." : "Check Answer"}
          </button>
          <button onClick={undo} disabled={!puzzle || !canUndo || !canInteractBoard}>
            Undo
          </button>
          <button onClick={redo} disabled={!puzzle || !canRedo || !canInteractBoard}>
            Redo
          </button>
          <button onClick={resetGrid} disabled={!puzzle || !canInteractBoard}>
            Clear
          </button>
        </div>

        <div className="racePanel">
          {!isInRaceRoom && (
            <>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname"
              />
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="Room Code"
              />
              <button
                onClick={() => {
                  setCreateNickname(nickname);
                  setCreateRoomTitle("");
                  setCreateSize(selectedSize);
                  setShowCreateModal(true);
                }}
                disabled={isLoading}
              >
                방 만들기
              </button>
              <button onClick={joinRaceRoom} disabled={isLoading || !nickname.trim() || !roomCodeInput.trim()}>
                Join Room
              </button>
            </>
          )}
          <button onClick={leaveRace} disabled={!raceRoomCode}>
            Leave Room
          </button>
        </div>

        {raceRoomCode && (
          <div className="raceStateBox">
            <div>
              Room: <b>{raceRoomCode}</b>
            </div>
            {roomTitleText && (
              <div>
                Title: <b>{roomTitleText}</b>
              </div>
            )}
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
            {raceResultText && <div className="raceResult">{raceResultText}</div>}
            {isRaceFinished && (
              <div className="raceActions">
                <button onClick={requestRematch} disabled={isRematchLoading}>
                  {isRematchLoading ? "준비중..." : "한판 더?"}
                </button>
              </div>
            )}
            <div className="racePlayers">
              {(raceState?.players || []).map((p) => (
                <span key={p.playerId}>
                  {p.nickname}
                  {raceState?.hostPlayerId === p.playerId ? " [host]" : ""}
                  {p.isReady ? " [ready]" : " [not ready]"}:
                  {Number.isInteger(p.elapsedSec) ? ` ${p.elapsedSec}s` : " playing"}
                </span>
              ))}
            </div>
          </div>
        )}

        {puzzle && (
          <div className="meta">
            <span>ID: {puzzle.id}</span>
            <span>
              Size: {puzzle.width}x{puzzle.height}
            </span>
            <span>Unique: {String(puzzle.is_unique)}</span>
            <span>{progressText}</span>
            <span>Time: {formattedTime}</span>
          </div>
        )}

        {status && <div className="status">{status}</div>}

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
                방 제목
                <input
                  type="text"
                  value={createRoomTitle}
                  onChange={(e) => setCreateRoomTitle(e.target.value)}
                  placeholder="예: 10x10 스피드전"
                />
              </label>
              <label>
                닉네임
                <input
                  type="text"
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  placeholder="닉네임"
                />
              </label>
              <div className="modalActions">
                <button onClick={() => setShowCreateModal(false)}>취소</button>
                <button onClick={createRaceRoom} disabled={isLoading || !createNickname.trim()}>
                  {isLoading ? "생성중..." : "생성"}
                </button>
              </div>
            </div>
          </div>
        )}

        {puzzle && (
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
      </section>
    </main>
  );
}

export default App;
