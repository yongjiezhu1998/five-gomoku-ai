const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const GRID_GAP = 40;
const PADDING = 30;

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const SCORE_TABLE = {
  FIVE: 1000000,
  OPEN_FOUR: 100000,
  BLOCKED_FOUR: 10000,
  OPEN_THREE: 5000,
  BLOCKED_THREE: 1000,
  OPEN_TWO: 300,
  BLOCKED_TWO: 80,
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const modeEl = document.getElementById("mode");
const firstEl = document.getElementById("first");
const levelEl = document.getElementById("level");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");
const toggleAIBtn = document.getElementById("toggle-ai");
const statusText = document.getElementById("status-text");

const state = {
  board: createBoard(),
  turn: BLACK,
  winner: EMPTY,
  moves: [],
  mode: "human-vs-ai",
  first: "black-human",
  level: 2,
  aiPaused: false,
  aiThinking: false,
  aiLoopTimer: null,
};

function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function other(color) {
  return color === BLACK ? WHITE : BLACK;
}

function cellToPixel(i) {
  return PADDING + i * GRID_GAP;
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const linePos = cellToPixel(i);
    ctx.beginPath();
    ctx.moveTo(cellToPixel(0), linePos);
    ctx.lineTo(cellToPixel(BOARD_SIZE - 1), linePos);
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(linePos, cellToPixel(0));
    ctx.lineTo(linePos, cellToPixel(BOARD_SIZE - 1));
    ctx.stroke();
  }

  const stars = [
    [3, 3],
    [3, 11],
    [11, 3],
    [11, 11],
    [7, 7],
  ];

  stars.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(cellToPixel(x), cellToPixel(y), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#633d1f";
    ctx.fill();
  });
}

function drawPieces() {
  state.moves.forEach((move, idx) => {
    const { x, y, color } = move;
    const px = cellToPixel(x);
    const py = cellToPixel(y);
    const grad = ctx.createRadialGradient(px - 4, py - 4, 3, px, py, 16);

    if (color === BLACK) {
      grad.addColorStop(0, "#666");
      grad.addColorStop(1, "#111");
    } else {
      grad.addColorStop(0, "#fff");
      grad.addColorStop(1, "#d8d8d8");
    }

    ctx.beginPath();
    ctx.arc(px, py, 16, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    ctx.stroke();

    if (idx === state.moves.length - 1) {
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = color === BLACK ? "#f5f5f5" : "#111";
      ctx.fill();
    }
  });
}

function render() {
  drawBoard();
  drawPieces();
  updateStatus();
}

function getPlayerTypeByColor(color) {
  if (state.mode === "ai-vs-ai") return "ai";
  if (state.first === "black-human") {
    return color === BLACK ? "human" : "ai";
  }
  return color === BLACK ? "ai" : "human";
}

function isAITurn() {
  return getPlayerTypeByColor(state.turn) === "ai";
}

function updateStatus() {
  if (state.winner !== EMPTY) {
    statusText.textContent = state.winner === BLACK ? "黑棋获胜" : "白棋获胜";
    return;
  }
  if (state.moves.length === BOARD_SIZE * BOARD_SIZE) {
    statusText.textContent = "平局";
    return;
  }
  const turnText = state.turn === BLACK ? "黑棋" : "白棋";
  const playerText = getPlayerTypeByColor(state.turn) === "ai" ? "AI" : "人类";
  const thinking = state.aiThinking && getPlayerTypeByColor(state.turn) === "ai" ? "（思考中）" : "";
  statusText.textContent = `${turnText}回合 - ${playerText}${thinking}`;
}

function checkWinByMove(board, x, y, color) {
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1;
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny) && board[nx][ny] === color) {
      count += 1;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (inBounds(nx, ny) && board[nx][ny] === color) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }
    if (count >= 5) return true;
  }
  return false;
}

function placeMove(x, y, color) {
  if (!inBounds(x, y)) return false;
  if (state.board[x][y] !== EMPTY || state.winner !== EMPTY) return false;
  state.board[x][y] = color;
  state.moves.push({ x, y, color });

  if (checkWinByMove(state.board, x, y, color)) {
    state.winner = color;
  } else if (state.moves.length < BOARD_SIZE * BOARD_SIZE) {
    state.turn = other(color);
  }
  return true;
}

function restartGame() {
  if (state.aiLoopTimer) {
    clearTimeout(state.aiLoopTimer);
    state.aiLoopTimer = null;
  }
  state.board = createBoard();
  state.turn = BLACK;
  state.winner = EMPTY;
  state.moves = [];
  state.aiThinking = false;
  state.mode = modeEl.value;
  state.first = firstEl.value;
  state.level = Number(levelEl.value);
  state.aiPaused = false;
  toggleAIBtn.textContent = "暂停 AI 自对弈";
  render();
  scheduleAIIfNeeded();
}

function undo() {
  if (state.moves.length === 0 || state.winner !== EMPTY) return;
  const mode = state.mode;
  const currentActor = getPlayerTypeByColor(state.turn);

  const popLast = () => {
    const last = state.moves.pop();
    if (!last) return;
    state.board[last.x][last.y] = EMPTY;
    state.turn = last.color;
  };

  if (mode === "human-vs-ai") {
    if (currentActor === "ai") {
      popLast();
    }
    popLast();
  } else {
    popLast();
  }
  state.winner = EMPTY;
  render();
}

function getClickPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const gx = Math.round((x - PADDING) / GRID_GAP);
  const gy = Math.round((y - PADDING) / GRID_GAP);
  return { gx, gy };
}

function onBoardClick(event) {
  if (state.mode !== "human-vs-ai") return;
  if (isAITurn() || state.winner !== EMPTY) return;
  const { gx, gy } = getClickPoint(event);
  if (!inBounds(gx, gy)) return;
  if (!placeMove(gx, gy, state.turn)) return;
  render();
  scheduleAIIfNeeded();
}

function countLine(board, x, y, color, dx, dy) {
  let count = 0;
  let nx = x + dx;
  let ny = y + dy;
  while (inBounds(nx, ny) && board[nx][ny] === color) {
    count += 1;
    nx += dx;
    ny += dy;
  }
  const open = inBounds(nx, ny) && board[nx][ny] === EMPTY;
  return { count, open };
}

function scoreByPattern(len, openEnds) {
  if (len >= 5) return SCORE_TABLE.FIVE;
  if (len === 4) return openEnds === 2 ? SCORE_TABLE.OPEN_FOUR : openEnds === 1 ? SCORE_TABLE.BLOCKED_FOUR : 0;
  if (len === 3) return openEnds === 2 ? SCORE_TABLE.OPEN_THREE : openEnds === 1 ? SCORE_TABLE.BLOCKED_THREE : 0;
  if (len === 2) return openEnds === 2 ? SCORE_TABLE.OPEN_TWO : openEnds === 1 ? SCORE_TABLE.BLOCKED_TWO : 0;
  return 0;
}

function evaluatePoint(board, x, y, color) {
  if (board[x][y] !== EMPTY) return -1;
  let score = 0;
  for (const [dx, dy] of DIRECTIONS) {
    const pos = countLine(board, x, y, color, dx, dy);
    const neg = countLine(board, x, y, color, -dx, -dy);
    const len = 1 + pos.count + neg.count;
    const openEnds = (pos.open ? 1 : 0) + (neg.open ? 1 : 0);
    score += scoreByPattern(len, openEnds);
  }
  return score;
}

function hasNeighbor(board, x, y, dist = 2) {
  for (let dx = -dist; dx <= dist; dx += 1) {
    for (let dy = -dist; dy <= dist; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && board[nx][ny] !== EMPTY) return true;
    }
  }
  return false;
}

function generateCandidates(board, color, limit = 18) {
  const enemy = other(color);
  const candidates = [];

  if (state.moves.length === 0) {
    return [{ x: 7, y: 7, score: 0 }];
  }

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      if (board[x][y] !== EMPTY || !hasNeighbor(board, x, y)) continue;
      const offense = evaluatePoint(board, x, y, color);
      const defense = evaluatePoint(board, x, y, enemy);
      const score = offense + defense * 0.95;
      candidates.push({ x, y, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

function evaluateBoard(board, color) {
  const enemy = other(color);
  let myScore = 0;
  let enemyScore = 0;
  for (let x = 0; x < BOARD_SIZE; x += 1) {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      if (board[x][y] !== EMPTY) continue;
      myScore += evaluatePoint(board, x, y, color);
      enemyScore += evaluatePoint(board, x, y, enemy);
    }
  }
  return myScore - enemyScore * 1.05;
}

function negamax(board, color, depth, alpha, beta, branchLimit) {
  const previousMove = state.moves[state.moves.length - 1];
  if (previousMove && checkWinByMove(board, previousMove.x, previousMove.y, previousMove.color)) {
    return previousMove.color === color ? -SCORE_TABLE.FIVE : SCORE_TABLE.FIVE;
  }

  if (depth === 0) {
    return evaluateBoard(board, color);
  }

  const candidates = generateCandidates(board, color, branchLimit);
  if (candidates.length === 0) return 0;

  let best = -Infinity;
  for (const move of candidates) {
    board[move.x][move.y] = color;
    state.moves.push({ x: move.x, y: move.y, color });
    const value = -negamax(board, other(color), depth - 1, -beta, -alpha, branchLimit);
    state.moves.pop();
    board[move.x][move.y] = EMPTY;

    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function getBestMove(board, color, level) {
  const depth = level === 1 ? 1 : level === 2 ? 2 : 3;
  const branchLimit = level === 1 ? 10 : level === 2 ? 14 : 18;
  const candidates = generateCandidates(board, color, branchLimit + 8);
  if (candidates.length === 0) return { x: 7, y: 7 };

  let bestMove = candidates[0];
  let bestValue = -Infinity;

  for (const move of candidates) {
    board[move.x][move.y] = color;
    state.moves.push({ x: move.x, y: move.y, color });

    const immediateWin = checkWinByMove(board, move.x, move.y, color);
    let value;
    if (immediateWin) {
      value = SCORE_TABLE.FIVE;
    } else {
      value = -negamax(board, other(color), depth - 1, -Infinity, Infinity, branchLimit);
    }

    state.moves.pop();
    board[move.x][move.y] = EMPTY;

    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return { x: bestMove.x, y: bestMove.y };
}

function aiStep() {
  if (state.aiPaused || state.winner !== EMPTY || !isAITurn()) {
    state.aiThinking = false;
    render();
    return;
  }
  state.aiThinking = true;
  render();

  setTimeout(() => {
    if (state.aiPaused || state.winner !== EMPTY || !isAITurn()) {
      state.aiThinking = false;
      render();
      return;
    }
    const move = getBestMove(state.board, state.turn, state.level);
    placeMove(move.x, move.y, state.turn);
    state.aiThinking = false;
    render();

    if (state.mode === "ai-vs-ai" && state.winner === EMPTY && !state.aiPaused) {
      state.aiLoopTimer = setTimeout(aiStep, 250);
    }
  }, 120);
}

function scheduleAIIfNeeded() {
  if (state.winner !== EMPTY || state.aiPaused) return;
  if (!isAITurn()) return;
  if (state.mode === "ai-vs-ai") {
    state.aiLoopTimer = setTimeout(aiStep, 200);
  } else {
    aiStep();
  }
}

function bindEvents() {
  canvas.addEventListener("click", onBoardClick);
  newGameBtn.addEventListener("click", restartGame);
  undoBtn.addEventListener("click", () => {
    undo();
    scheduleAIIfNeeded();
  });

  toggleAIBtn.addEventListener("click", () => {
    if (state.mode !== "ai-vs-ai") {
      statusText.textContent = "当前模式不是 AI 自对弈";
      return;
    }
    state.aiPaused = !state.aiPaused;
    toggleAIBtn.textContent = state.aiPaused ? "恢复 AI 自对弈" : "暂停 AI 自对弈";
    render();
    if (!state.aiPaused) scheduleAIIfNeeded();
  });

  modeEl.addEventListener("change", () => {
    if (modeEl.value === "ai-vs-ai") {
      firstEl.value = "black-ai";
      firstEl.disabled = true;
    } else {
      firstEl.disabled = false;
    }
    restartGame();
  });

  firstEl.addEventListener("change", restartGame);
  levelEl.addEventListener("change", restartGame);
}

function init() {
  bindEvents();
  render();
  scheduleAIIfNeeded();
}

init();
