const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const gameTypeEl = document.getElementById("game-type");
const modeEl = document.getElementById("mode");
const firstEl = document.getElementById("first");
const levelEl = document.getElementById("level");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");
const toggleAIBtn = document.getElementById("toggle-ai");
const statusText = document.getElementById("status-text");

const GOMOKU = {
  SIZE: 15,
  EMPTY: 0,
  BLACK: 1,
  WHITE: 2,
  GAP: 40,
  PADDING: 30,
  DIRECTIONS: [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ],
  SCORE: {
    FIVE: 1000000,
    OPEN_FOUR: 100000,
    BLOCKED_FOUR: 10000,
    OPEN_THREE: 5000,
    BLOCKED_THREE: 1000,
    OPEN_TWO: 300,
    BLOCKED_TWO: 80,
  },
};

const XIANGQI = {
  WIDTH: 9,
  HEIGHT: 10,
  PADDING: 50,
  PIECE_TEXT: {
    R: "车",
    N: "马",
    B: "相",
    A: "仕",
    K: "帅",
    C: "炮",
    P: "兵",
    r: "车",
    n: "马",
    b: "象",
    a: "士",
    k: "将",
    c: "炮",
    p: "卒",
  },
  VALUE: {
    K: 10000,
    A: 120,
    B: 120,
    N: 270,
    R: 600,
    C: 300,
    P: 70,
  },
};

const state = {
  gameType: "gomoku",
  mode: "human-vs-ai",
  first: "player-first",
  level: 2,
  aiPaused: false,
  aiThinking: false,
  aiLoopTimer: null,
  board: [],
  turn: null,
  winner: null,
  isDraw: false,
  moves: [],
  selected: null,
};

function inRange(v, min, max) {
  return v >= min && v <= max;
}

function clearTimer() {
  if (state.aiLoopTimer) {
    clearTimeout(state.aiLoopTimer);
    state.aiLoopTimer = null;
  }
}

function sideName(side) {
  if (state.gameType === "gomoku") return side === GOMOKU.BLACK ? "黑棋" : "白棋";
  return side === "r" ? "红方" : "黑方";
}

function getCurrentHumanSide() {
  if (state.mode === "ai-vs-ai") return null;
  if (state.gameType === "gomoku") {
    return state.first === "player-first" ? GOMOKU.BLACK : GOMOKU.WHITE;
  }
  return state.first === "player-first" ? "r" : "b";
}

function getPlayerTypeBySide(side) {
  if (state.mode === "ai-vs-ai") return "ai";
  return side === getCurrentHumanSide() ? "human" : "ai";
}

function isAITurn() {
  return getPlayerTypeBySide(state.turn) === "ai";
}

function updateStatus() {
  if (state.winner !== null) {
    statusText.textContent = `${sideName(state.winner)}获胜`;
    return;
  }
  if (state.isDraw) {
    statusText.textContent = "平局";
    return;
  }
  const actor = getPlayerTypeBySide(state.turn) === "ai" ? "AI" : "人类";
  const thinking = state.aiThinking && actor === "AI" ? "（思考中）" : "";
  statusText.textContent = `${sideName(state.turn)}回合 - ${actor}${thinking}`;
}

function render() {
  if (state.gameType === "gomoku") {
    drawGomoku();
  } else {
    drawXiangqi();
  }
  updateStatus();
}

function restartGame() {
  clearTimer();
  state.gameType = gameTypeEl.value;
  state.mode = modeEl.value;
  state.first = firstEl.value;
  state.level = Number(levelEl.value);
  state.aiPaused = false;
  state.aiThinking = false;
  state.winner = null;
  state.isDraw = false;
  state.moves = [];
  state.selected = null;
  toggleAIBtn.textContent = "暂停 AI 自对弈";

  if (state.gameType === "gomoku") {
    state.board = Array.from({ length: GOMOKU.SIZE }, () => Array(GOMOKU.SIZE).fill(GOMOKU.EMPTY));
    state.turn = GOMOKU.BLACK;
    canvas.setAttribute("aria-label", "五子棋棋盘");
  } else {
    state.board = createXiangqiBoard();
    state.turn = "r";
    canvas.setAttribute("aria-label", "象棋棋盘");
  }
  render();
  scheduleAIIfNeeded();
}

function undo() {
  if (state.moves.length === 0) return;
  if (state.winner !== null || state.isDraw) {
    state.winner = null;
    state.isDraw = false;
  }

  const popOne = () => {
    const mv = state.moves.pop();
    if (!mv) return;
    if (state.gameType === "gomoku") {
      state.board[mv.x][mv.y] = GOMOKU.EMPTY;
      state.turn = mv.color;
    } else {
      state.board[mv.fromY][mv.fromX] = mv.piece;
      state.board[mv.toY][mv.toX] = mv.captured;
      state.turn = mv.side;
    }
  };

  if (state.mode === "human-vs-ai") {
    if (isAITurn()) popOne();
    popOne();
  } else {
    popOne();
  }

  state.selected = null;
  render();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function handleBoardClick(event) {
  if (state.mode !== "human-vs-ai" || state.winner !== null || state.isDraw || isAITurn()) return;
  if (state.gameType === "gomoku") {
    const { gx, gy } = getGomokuCellByPoint(getCanvasPoint(event));
    if (!inRange(gx, 0, GOMOKU.SIZE - 1) || !inRange(gy, 0, GOMOKU.SIZE - 1)) return;
    if (!placeGomokuMove(gx, gy, state.turn)) return;
  } else if (!handleXiangqiHumanMove(getCanvasPoint(event))) {
    return;
  }

  render();
  scheduleAIIfNeeded();
}

function aiStep() {
  if (state.aiPaused || state.winner !== null || state.isDraw || !isAITurn()) {
    state.aiThinking = false;
    render();
    return;
  }
  state.aiThinking = true;
  render();

  setTimeout(() => {
    if (state.aiPaused || state.winner !== null || state.isDraw || !isAITurn()) {
      state.aiThinking = false;
      render();
      return;
    }
    if (state.gameType === "gomoku") {
      const mv = getBestGomokuMove(state.board, state.turn, state.level, state.moves);
      placeGomokuMove(mv.x, mv.y, state.turn);
    } else {
      const mv = getBestXiangqiMove(state.board, state.turn, state.level);
      if (mv) {
        applyXiangqiMove(mv);
      } else {
        state.isDraw = true;
      }
    }

    state.aiThinking = false;
    render();
    if (state.mode === "ai-vs-ai" && state.winner === null && !state.isDraw && !state.aiPaused) {
      state.aiLoopTimer = setTimeout(aiStep, 250);
    }
  }, 120);
}

function scheduleAIIfNeeded() {
  if (state.winner !== null || state.isDraw || state.aiPaused || !isAITurn()) return;
  if (state.mode === "ai-vs-ai") {
    state.aiLoopTimer = setTimeout(aiStep, 200);
  } else {
    aiStep();
  }
}

function updateControlByGameType() {
  if (gameTypeEl.value === "xiangqi") {
    firstEl.options[0].textContent = "玩家先手(红方)";
    firstEl.options[1].textContent = "AI 先手(红方)";
  } else {
    firstEl.options[0].textContent = "玩家先手(黑棋)";
    firstEl.options[1].textContent = "AI 先手(黑棋)";
  }
}

function bindEvents() {
  canvas.addEventListener("click", handleBoardClick);
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
      firstEl.value = "ai-first";
      firstEl.disabled = true;
    } else {
      firstEl.disabled = false;
    }
    restartGame();
  });

  gameTypeEl.addEventListener("change", () => {
    updateControlByGameType();
    restartGame();
  });

  firstEl.addEventListener("change", restartGame);
  levelEl.addEventListener("change", restartGame);
}

function init() {
  bindEvents();
  updateControlByGameType();
  restartGame();
}

// ===== Gomoku =====
function gomokuInBounds(x, y) {
  return inRange(x, 0, GOMOKU.SIZE - 1) && inRange(y, 0, GOMOKU.SIZE - 1);
}

function gomokuOther(color) {
  return color === GOMOKU.BLACK ? GOMOKU.WHITE : GOMOKU.BLACK;
}

function gomokuCellToPixel(i) {
  return GOMOKU.PADDING + i * GOMOKU.GAP;
}

function getGomokuCellByPoint(point) {
  return {
    gx: Math.round((point.x - GOMOKU.PADDING) / GOMOKU.GAP),
    gy: Math.round((point.y - GOMOKU.PADDING) / GOMOKU.GAP),
  };
}

function drawGomoku() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < GOMOKU.SIZE; i += 1) {
    const p = gomokuCellToPixel(i);
    ctx.beginPath();
    ctx.moveTo(gomokuCellToPixel(0), p);
    ctx.lineTo(gomokuCellToPixel(GOMOKU.SIZE - 1), p);
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, gomokuCellToPixel(0));
    ctx.lineTo(p, gomokuCellToPixel(GOMOKU.SIZE - 1));
    ctx.stroke();
  }

  [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(gomokuCellToPixel(x), gomokuCellToPixel(y), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#633d1f";
    ctx.fill();
  });

  state.moves.forEach((mv, idx) => {
    const px = gomokuCellToPixel(mv.x);
    const py = gomokuCellToPixel(mv.y);
    const grad = ctx.createRadialGradient(px - 4, py - 4, 3, px, py, 16);
    if (mv.color === GOMOKU.BLACK) {
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
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.stroke();

    if (idx === state.moves.length - 1) {
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = mv.color === GOMOKU.BLACK ? "#f5f5f5" : "#111";
      ctx.fill();
    }
  });
}

function checkGomokuWin(board, x, y, color) {
  for (const [dx, dy] of GOMOKU.DIRECTIONS) {
    let count = 1;
    let nx = x + dx;
    let ny = y + dy;
    while (gomokuInBounds(nx, ny) && board[nx][ny] === color) {
      count += 1;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (gomokuInBounds(nx, ny) && board[nx][ny] === color) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }
    if (count >= 5) return true;
  }
  return false;
}

function placeGomokuMove(x, y, color) {
  if (!gomokuInBounds(x, y) || state.board[x][y] !== GOMOKU.EMPTY) return false;
  state.board[x][y] = color;
  state.moves.push({ x, y, color });
  if (checkGomokuWin(state.board, x, y, color)) {
    state.winner = color;
  } else if (state.moves.length === GOMOKU.SIZE * GOMOKU.SIZE) {
    state.isDraw = true;
  } else {
    state.turn = gomokuOther(color);
  }
  return true;
}

function gomokuCountLine(board, x, y, color, dx, dy) {
  let count = 0;
  let nx = x + dx;
  let ny = y + dy;
  while (gomokuInBounds(nx, ny) && board[nx][ny] === color) {
    count += 1;
    nx += dx;
    ny += dy;
  }
  return { count, open: gomokuInBounds(nx, ny) && board[nx][ny] === GOMOKU.EMPTY };
}

function gomokuPatternScore(len, openEnds) {
  if (len >= 5) return GOMOKU.SCORE.FIVE;
  if (len === 4) return openEnds === 2 ? GOMOKU.SCORE.OPEN_FOUR : openEnds === 1 ? GOMOKU.SCORE.BLOCKED_FOUR : 0;
  if (len === 3) return openEnds === 2 ? GOMOKU.SCORE.OPEN_THREE : openEnds === 1 ? GOMOKU.SCORE.BLOCKED_THREE : 0;
  if (len === 2) return openEnds === 2 ? GOMOKU.SCORE.OPEN_TWO : openEnds === 1 ? GOMOKU.SCORE.BLOCKED_TWO : 0;
  return 0;
}

function evaluateGomokuPoint(board, x, y, color) {
  if (board[x][y] !== GOMOKU.EMPTY) return -1;
  let score = 0;
  for (const [dx, dy] of GOMOKU.DIRECTIONS) {
    const pos = gomokuCountLine(board, x, y, color, dx, dy);
    const neg = gomokuCountLine(board, x, y, color, -dx, -dy);
    const len = 1 + pos.count + neg.count;
    const openEnds = (pos.open ? 1 : 0) + (neg.open ? 1 : 0);
    score += gomokuPatternScore(len, openEnds);
  }
  return score;
}

function gomokuHasNeighbor(board, x, y, dist = 2) {
  for (let dx = -dist; dx <= dist; dx += 1) {
    for (let dy = -dist; dy <= dist; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (gomokuInBounds(nx, ny) && board[nx][ny] !== GOMOKU.EMPTY) return true;
    }
  }
  return false;
}

function generateGomokuCandidates(board, color, moves, limit) {
  const enemy = gomokuOther(color);
  if (moves.length === 0) return [{ x: 7, y: 7, score: 0 }];
  const out = [];
  for (let x = 0; x < GOMOKU.SIZE; x += 1) {
    for (let y = 0; y < GOMOKU.SIZE; y += 1) {
      if (board[x][y] !== GOMOKU.EMPTY || !gomokuHasNeighbor(board, x, y)) continue;
      const offense = evaluateGomokuPoint(board, x, y, color);
      const defense = evaluateGomokuPoint(board, x, y, enemy);
      out.push({ x, y, score: offense + defense * 0.95 });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function evaluateGomokuBoard(board, color) {
  const enemy = gomokuOther(color);
  let myScore = 0;
  let enemyScore = 0;
  for (let x = 0; x < GOMOKU.SIZE; x += 1) {
    for (let y = 0; y < GOMOKU.SIZE; y += 1) {
      if (board[x][y] !== GOMOKU.EMPTY) continue;
      myScore += evaluateGomokuPoint(board, x, y, color);
      enemyScore += evaluateGomokuPoint(board, x, y, enemy);
    }
  }
  return myScore - enemyScore * 1.05;
}

function negamaxGomoku(board, color, depth, alpha, beta, moves, branchLimit) {
  const prev = moves[moves.length - 1];
  if (prev && checkGomokuWin(board, prev.x, prev.y, prev.color)) {
    return prev.color === color ? -GOMOKU.SCORE.FIVE : GOMOKU.SCORE.FIVE;
  }
  if (depth === 0) return evaluateGomokuBoard(board, color);
  const candidates = generateGomokuCandidates(board, color, moves, branchLimit);
  if (candidates.length === 0) return 0;
  let best = -Infinity;
  for (const mv of candidates) {
    board[mv.x][mv.y] = color;
    moves.push({ x: mv.x, y: mv.y, color });
    const value = -negamaxGomoku(board, gomokuOther(color), depth - 1, -beta, -alpha, moves, branchLimit);
    moves.pop();
    board[mv.x][mv.y] = GOMOKU.EMPTY;
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function getBestGomokuMove(board, color, level, moves) {
  const depth = level === 1 ? 1 : level === 2 ? 2 : 3;
  const branchLimit = level === 1 ? 10 : level === 2 ? 14 : 18;
  const candidates = generateGomokuCandidates(board, color, moves, branchLimit + 8);
  if (candidates.length === 0) return { x: 7, y: 7 };
  let bestValue = -Infinity;
  let best = candidates[0];
  for (const mv of candidates) {
    board[mv.x][mv.y] = color;
    moves.push({ x: mv.x, y: mv.y, color });
    let value;
    if (checkGomokuWin(board, mv.x, mv.y, color)) {
      value = GOMOKU.SCORE.FIVE;
    } else {
      value = -negamaxGomoku(board, gomokuOther(color), depth - 1, -Infinity, Infinity, moves, branchLimit);
    }
    moves.pop();
    board[mv.x][mv.y] = GOMOKU.EMPTY;
    if (value > bestValue) {
      bestValue = value;
      best = mv;
    }
  }
  return { x: best.x, y: best.y };
}

// ===== Xiangqi =====
function createXiangqiBoard() {
  const board = Array.from({ length: XIANGQI.HEIGHT }, () => Array(XIANGQI.WIDTH).fill("."));
  board[0] = "rnbakabnr".split("");
  board[2][1] = "c";
  board[2][7] = "c";
  [0, 2, 4, 6, 8].forEach((x) => {
    board[3][x] = "p";
    board[6][x] = "P";
  });
  board[7][1] = "C";
  board[7][7] = "C";
  board[9] = "RNBAKABNR".split("");
  return board;
}

function isPiece(p) {
  return p && p !== ".";
}

function sideOf(piece) {
  if (!isPiece(piece)) return null;
  return piece === piece.toUpperCase() ? "r" : "b";
}

function opposite(side) {
  return side === "r" ? "b" : "r";
}

function inXiangqiBounds(x, y) {
  return inRange(x, 0, XIANGQI.WIDTH - 1) && inRange(y, 0, XIANGQI.HEIGHT - 1);
}

function inPalace(side, x, y) {
  if (!inRange(x, 3, 5)) return false;
  return side === "r" ? inRange(y, 7, 9) : inRange(y, 0, 2);
}

function hasCrossedRiver(side, y) {
  return side === "r" ? y <= 4 : y >= 5;
}

function countBetween(board, x1, y1, x2, y2) {
  let c = 0;
  if (x1 === x2) {
    const minY = Math.min(y1, y2) + 1;
    const maxY = Math.max(y1, y2);
    for (let y = minY; y < maxY; y += 1) if (board[y][x1] !== ".") c += 1;
  } else if (y1 === y2) {
    const minX = Math.min(x1, x2) + 1;
    const maxX = Math.max(x1, x2);
    for (let x = minX; x < maxX; x += 1) if (board[y1][x] !== ".") c += 1;
  }
  return c;
}

function canPseudoMove(board, fx, fy, tx, ty, piece) {
  if (!inXiangqiBounds(tx, ty)) return false;
  const target = board[ty][tx];
  const side = sideOf(piece);
  if (sideOf(target) === side) return false;

  const dx = tx - fx;
  const dy = ty - fy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const t = piece.toUpperCase();

  if (t === "R") {
    if (fx !== tx && fy !== ty) return false;
    return countBetween(board, fx, fy, tx, ty) === 0;
  }
  if (t === "C") {
    if (fx !== tx && fy !== ty) return false;
    const between = countBetween(board, fx, fy, tx, ty);
    if (target === ".") return between === 0;
    return between === 1;
  }
  if (t === "N") {
    if (!((adx === 2 && ady === 1) || (adx === 1 && ady === 2))) return false;
    if (adx === 2) return board[fy][fx + dx / 2] === ".";
    return board[fy + dy / 2][fx] === ".";
  }
  if (t === "B") {
    if (!(adx === 2 && ady === 2)) return false;
    if (board[fy + dy / 2][fx + dx / 2] !== ".") return false;
    if (side === "r" && ty <= 4) return false;
    if (side === "b" && ty >= 5) return false;
    return true;
  }
  if (t === "A") {
    if (!(adx === 1 && ady === 1)) return false;
    return inPalace(side, tx, ty);
  }
  if (t === "K") {
    if (tx === fx && target !== "." && target.toUpperCase() === "K" && countBetween(board, fx, fy, tx, ty) === 0) {
      return true;
    }
    if (!((adx === 1 && ady === 0) || (adx === 0 && ady === 1))) return false;
    return inPalace(side, tx, ty);
  }
  if (t === "P") {
    const forward = side === "r" ? -1 : 1;
    if (dy === forward && dx === 0) return true;
    if (dy === 0 && adx === 1 && hasCrossedRiver(side, fy)) return true;
    return false;
  }
  return false;
}

function findKing(board, side) {
  const target = side === "r" ? "K" : "k";
  for (let y = 0; y < XIANGQI.HEIGHT; y += 1) {
    for (let x = 0; x < XIANGQI.WIDTH; x += 1) {
      if (board[y][x] === target) return { x, y };
    }
  }
  return null;
}

function isInCheck(board, side) {
  const king = findKing(board, side);
  if (!king) return true;
  const enemy = opposite(side);
  for (let y = 0; y < XIANGQI.HEIGHT; y += 1) {
    for (let x = 0; x < XIANGQI.WIDTH; x += 1) {
      const p = board[y][x];
      if (sideOf(p) !== enemy) continue;
      if (canPseudoMove(board, x, y, king.x, king.y, p)) return true;
    }
  }
  return false;
}

function applyXiangqiMove(move) {
  const piece = state.board[move.fromY][move.fromX];
  const captured = state.board[move.toY][move.toX];
  state.board[move.toY][move.toX] = piece;
  state.board[move.fromY][move.fromX] = ".";
  state.moves.push({
    fromX: move.fromX,
    fromY: move.fromY,
    toX: move.toX,
    toY: move.toY,
    piece,
    captured,
    side: state.turn,
  });

  const enemy = opposite(state.turn);
  if (!findKing(state.board, enemy)) {
    state.winner = state.turn;
    return;
  }
  state.turn = enemy;
  const enemyMoves = generateXiangqiLegalMoves(state.board, state.turn);
  if (enemyMoves.length === 0) {
    state.winner = isInCheck(state.board, state.turn) ? opposite(state.turn) : null;
    state.isDraw = state.winner === null;
  }
}

function unapplyXiangqiMove(board, move, captured) {
  board[move.fromY][move.fromX] = board[move.toY][move.toX];
  board[move.toY][move.toX] = captured;
}

function generateXiangqiPseudoMoves(board, side) {
  const out = [];
  for (let y = 0; y < XIANGQI.HEIGHT; y += 1) {
    for (let x = 0; x < XIANGQI.WIDTH; x += 1) {
      const p = board[y][x];
      if (sideOf(p) !== side) continue;
      for (let ty = 0; ty < XIANGQI.HEIGHT; ty += 1) {
        for (let tx = 0; tx < XIANGQI.WIDTH; tx += 1) {
          if (canPseudoMove(board, x, y, tx, ty, p)) {
            out.push({ fromX: x, fromY: y, toX: tx, toY: ty });
          }
        }
      }
    }
  }
  return out;
}

function generateXiangqiLegalMoves(board, side) {
  const pseudo = generateXiangqiPseudoMoves(board, side);
  const legal = [];
  for (const mv of pseudo) {
    const captured = board[mv.toY][mv.toX];
    board[mv.toY][mv.toX] = board[mv.fromY][mv.fromX];
    board[mv.fromY][mv.fromX] = ".";
    if (!isInCheck(board, side)) legal.push(mv);
    unapplyXiangqiMove(board, mv, captured);
  }
  return legal;
}

function evaluateXiangqi(board, side) {
  let score = 0;
  for (let y = 0; y < XIANGQI.HEIGHT; y += 1) {
    for (let x = 0; x < XIANGQI.WIDTH; x += 1) {
      const p = board[y][x];
      if (!isPiece(p)) continue;
      const t = p.toUpperCase();
      let v = XIANGQI.VALUE[t] || 0;
      if (t === "P" && hasCrossedRiver(sideOf(p), y)) v += 30;
      score += sideOf(p) === side ? v : -v;
    }
  }
  return score;
}

function moveOrderScore(board, mv) {
  const target = board[mv.toY][mv.toX];
  if (!isPiece(target)) return 0;
  return (XIANGQI.VALUE[target.toUpperCase()] || 0) + 1000;
}

function negamaxXiangqi(board, side, depth, alpha, beta) {
  if (depth === 0) return evaluateXiangqi(board, side);
  const moves = generateXiangqiLegalMoves(board, side);
  if (moves.length === 0) return isInCheck(board, side) ? -999999 : 0;
  moves.sort((a, b) => moveOrderScore(board, b) - moveOrderScore(board, a));
  let best = -Infinity;
  for (const mv of moves) {
    const captured = board[mv.toY][mv.toX];
    board[mv.toY][mv.toX] = board[mv.fromY][mv.fromX];
    board[mv.fromY][mv.fromX] = ".";
    const value = -negamaxXiangqi(board, opposite(side), depth - 1, -beta, -alpha);
    unapplyXiangqiMove(board, mv, captured);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function getBestXiangqiMove(board, side, level) {
  const depth = level === 1 ? 1 : 2;
  const moves = generateXiangqiLegalMoves(board, side);
  if (moves.length === 0) return null;
  moves.sort((a, b) => moveOrderScore(board, b) - moveOrderScore(board, a));
  const limit = level === 3 ? 40 : level === 2 ? 26 : 16;
  let bestValue = -Infinity;
  let best = moves[0];
  for (const mv of moves.slice(0, limit)) {
    const captured = board[mv.toY][mv.toX];
    board[mv.toY][mv.toX] = board[mv.fromY][mv.fromX];
    board[mv.fromY][mv.fromX] = ".";
    const value = -negamaxXiangqi(board, opposite(side), depth - 1, -Infinity, Infinity);
    unapplyXiangqiMove(board, mv, captured);
    if (value > bestValue) {
      bestValue = value;
      best = mv;
    }
  }
  return best;
}

function getXiangqiLayout() {
  const xGap = (canvas.width - XIANGQI.PADDING * 2) / (XIANGQI.WIDTH - 1);
  const yGap = (canvas.height - XIANGQI.PADDING * 2) / (XIANGQI.HEIGHT - 1);
  return { xGap, yGap };
}

function xiangqiCellToPixel(x, y) {
  const { xGap, yGap } = getXiangqiLayout();
  return {
    px: XIANGQI.PADDING + x * xGap,
    py: XIANGQI.PADDING + y * yGap,
  };
}

function getXiangqiCellByPoint(point) {
  const { xGap, yGap } = getXiangqiLayout();
  return {
    x: Math.round((point.x - XIANGQI.PADDING) / xGap),
    y: Math.round((point.y - XIANGQI.PADDING) / yGap),
  };
}

function handleXiangqiHumanMove(point) {
  const cell = getXiangqiCellByPoint(point);
  if (!inXiangqiBounds(cell.x, cell.y)) return false;
  const piece = state.board[cell.y][cell.x];
  const side = state.turn;

  if (!state.selected) {
    if (sideOf(piece) === side) {
      state.selected = { x: cell.x, y: cell.y };
      render();
    }
    return false;
  }

  if (sideOf(piece) === side) {
    state.selected = { x: cell.x, y: cell.y };
    render();
    return false;
  }

  const legal = generateXiangqiLegalMoves(state.board, side);
  const move = legal.find(
    (mv) =>
      mv.fromX === state.selected.x &&
      mv.fromY === state.selected.y &&
      mv.toX === cell.x &&
      mv.toY === cell.y
  );
  if (!move) return false;
  state.selected = null;
  applyXiangqiMove(move);
  return true;
}

function drawXiangqi() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { xGap, yGap } = getXiangqiLayout();
  const left = XIANGQI.PADDING;
  const right = XIANGQI.PADDING + xGap * 8;
  const top = XIANGQI.PADDING;
  const bottom = XIANGQI.PADDING + yGap * 9;
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = 1;

  for (let y = 0; y <= 9; y += 1) {
    const py = top + y * yGap;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
  }
  for (let x = 0; x <= 8; x += 1) {
    const px = left + x * xGap;
    if (x === 0 || x === 8) {
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + yGap * 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, top + yGap * 5);
      ctx.lineTo(px, bottom);
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.moveTo(left + xGap * 3, top);
  ctx.lineTo(left + xGap * 5, top + yGap * 2);
  ctx.moveTo(left + xGap * 5, top);
  ctx.lineTo(left + xGap * 3, top + yGap * 2);
  ctx.moveTo(left + xGap * 3, top + yGap * 7);
  ctx.lineTo(left + xGap * 5, top + yGap * 9);
  ctx.moveTo(left + xGap * 5, top + yGap * 7);
  ctx.lineTo(left + xGap * 3, top + yGap * 9);
  ctx.stroke();

  ctx.fillStyle = "#7c5834";
  ctx.font = "28px serif";
  ctx.textAlign = "center";
  ctx.fillText("楚 河", left + xGap * 2, top + yGap * 4.7);
  ctx.fillText("汉 界", left + xGap * 6, top + yGap * 4.7);

  for (let y = 0; y < XIANGQI.HEIGHT; y += 1) {
    for (let x = 0; x < XIANGQI.WIDTH; x += 1) {
      const piece = state.board[y][x];
      if (!isPiece(piece)) continue;
      const { px, py } = xiangqiCellToPixel(x, y);
      ctx.beginPath();
      ctx.arc(px, py, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#f7e7c5";
      ctx.fill();
      ctx.strokeStyle = sideOf(piece) === "r" ? "#b91c1c" : "#1f2937";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = sideOf(piece) === "r" ? "#b91c1c" : "#111827";
      ctx.font = "bold 28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(XIANGQI.PIECE_TEXT[piece], px, py + 1);
    }
  }

  if (state.selected) {
    const { px, py } = xiangqiCellToPixel(state.selected.x, state.selected.y);
    ctx.beginPath();
    ctx.arc(px, py, 26, 0, Math.PI * 2);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

init();
