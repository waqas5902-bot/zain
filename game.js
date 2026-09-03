"use strict";

/* ============================================================
   2048 — a compact, dependency-free puzzle game.
   Keyboard (arrows / WASD) + touch swipe + undo + best score.
   ============================================================ */

const SIZE = 4;
const WIN_VALUE = 2048;

// --- DOM references --------------------------------------------------------
const tilesEl = document.getElementById("tiles");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayTextEl = document.getElementById("overlay-text");
const overlayPrimaryEl = document.getElementById("overlay-primary");
const overlaySecondaryEl = document.getElementById("overlay-secondary");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");
const board = document.getElementById("board");

// --- State -----------------------------------------------------------------
let grid = [];       // SIZE x SIZE array of tile objects (or null)
let tiles = [];      // flat list of live tiles
let score = 0;
let best = 0;
let over = false;    // no moves remain
let winShown = false; // the 2048 win overlay has been shown
let tileId = 0;
let undoStack = [];

const BEST_KEY = "zain-2048-best";

// --- Persistence -----------------------------------------------------------
function loadBest() {
  try {
    const v = localStorage.getItem(BEST_KEY);
    best = v === null ? 0 : parseInt(v, 10) || 0;
  } catch (e) {
    best = 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch (e) {
    /* storage may be unavailable — ignore */
  }
}

// --- Tile helpers ----------------------------------------------------------
function createTile(value, row, col) {
  return { id: tileId++, value, row, col };
}

function tileClass(value) {
  return value <= WIN_VALUE ? "tile-" + value : "tile-super";
}

function bindAnimationCleanup(el) {
  el.addEventListener("animationend", function () {
    el.classList.remove("tile-pop", "tile-spawn");
  });
}

function buildTileElement(tile, animateSpawn) {
  const el = document.createElement("div");
  el.id = "tile-" + tile.id;
  el.textContent = tile.value;
  el.setAttribute("data-digits", String(tile.value).length);
  el.classList.add("tile", tileClass(tile.value));
  if (animateSpawn) el.classList.add("tile-spawn");
  el.style.setProperty("--row", tile.row);
  el.style.setProperty("--col", tile.col);
  bindAnimationCleanup(el);
  tile.element = el;
  return el;
}

function refreshTileElement(tile) {
  const el = tile.element;
  el.textContent = tile.value;
  el.setAttribute("data-digits", String(tile.value).length);
  el.className = "tile " + tileClass(tile.value);
}

function setPos(tile) {
  tile.element.style.setProperty("--row", tile.row);
  tile.element.style.setProperty("--col", tile.col);
}

function rebuildGrid() {
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  tiles.forEach(function (t) {
    grid[t.row][t.col] = t;
  });
}

// --- Board construction ----------------------------------------------------
function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function randomEmptyCell() {
  const empties = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) empties.push({ r, c });
    }
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function spawnTile(animate) {
  const cell = randomEmptyCell();
  if (!cell) return null;
  const value = Math.random() < 0.9 ? 2 : 4;
  const tile = createTile(value, cell.r, cell.c);
  grid[cell.r][cell.c] = tile;
  tiles.push(tile);
  const el = buildTileElement(tile, animate !== false);
  tilesEl.appendChild(el);
  return tile;
}

function renderBoard() {
  tilesEl.innerHTML = "";
  tiles.forEach(function (t) {
    t.element = null;
    const el = buildTileElement(t, false);
    tilesEl.appendChild(el);
    t.element = el;
  });
}

// --- Movement --------------------------------------------------------------
function getLines(dir) {
  const lines = [];
  const horizontal = dir === "left" || dir === "right";
  for (let i = 0; i < SIZE; i++) {
    const line = [];
    for (let j = 0; j < SIZE; j++) {
      let r, c;
      if (horizontal) {
        r = i;
        c = dir === "left" ? j : SIZE - 1 - j;
      } else {
        c = i;
        r = dir === "up" ? j : SIZE - 1 - j;
      }
      line.push(grid[r][c]);
    }
    lines.push(line);
  }
  return lines;
}

function positionFor(dir, lineIndex, i) {
  if (dir === "left") return [lineIndex, i];
  if (dir === "right") return [lineIndex, SIZE - 1 - i];
  if (dir === "up") return [i, lineIndex];
  return [SIZE - 1 - i, lineIndex]; // down
}

function computeMove(dir) {
  let moved = false;
  let gained = 0;
  const lines = getLines(dir);

  for (let li = 0; li < SIZE; li++) {
    const line = lines[li].filter(function (t) { return t !== null; });
    const merged = [];

    for (let i = 0; i < line.length; i++) {
      if (i + 1 < line.length && line[i].value === line[i + 1].value) {
        const survivor = line[i];
        const absorbed = line[i + 1];
        survivor.value *= 2;
        survivor.willMerge = true;
        absorbed.willRemove = true;
        absorbed.mergeInto = survivor;
        gained += survivor.value;
        merged.push(survivor);
        i++;
      } else {
        merged.push(line[i]);
      }
    }

    if (merged.length < line.length) moved = true;

    for (let i = 0; i < merged.length; i++) {
      const t = merged[i];
      const pos = positionFor(dir, li, i);
      if (t.row !== pos[0] || t.col !== pos[1]) moved = true;
      t.row = pos[0];
      t.col = pos[1];
    }
  }

  return { moved, gained };
}

function applyMoveAnimation(mergedTiles, removedTiles) {
  removedTiles.forEach(function (t) {
    const el = t.element;
    if (!el) return;
    const target = t.mergeInto;
    el.style.setProperty("--row", target.row);
    el.style.setProperty("--col", target.col);
    el.classList.add("tile-gone");
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 140);
  });

  tiles.forEach(function (t) {
    setPos(t);
    refreshTileElement(t);
    if (mergedTiles.indexOf(t) !== -1) {
      window.setTimeout(function () {
        if (t.element) t.element.classList.add("tile-pop");
      }, 140);
    }
  });
}

function move(dir) {
  if (over) return;
  if (!overlayEl.hidden) return; // wait for the player's choice on an open overlay

  pushUndo();

  const result = computeMove(dir);
  if (!result.moved) {
    undoStack.pop(); // nothing changed — discard the snapshot
    return;
  }

  // capture animation groups before mutating the live lists
  const mergedTiles = tiles.filter(function (t) { return t.willMerge; });
  const removedTiles = tiles.filter(function (t) { return t.willRemove; });

  tiles = tiles.filter(function (t) { return !t.willRemove; });
  tiles.forEach(function (t) {
    t.willMerge = false;
    t.willRemove = false;
    t.mergeInto = null;
  });

  rebuildGrid();

  score += result.gained;
  updateScore();

  applyMoveAnimation(mergedTiles, removedTiles);

  spawnTile(true);
  checkState();
}

// --- Win / lose ------------------------------------------------------------
function isGameOver() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) return false;
      if (c + 1 < SIZE && grid[r][c].value === grid[r][c + 1].value) return false;
      if (r + 1 < SIZE && grid[r][c].value === grid[r + 1][c].value) return false;
    }
  }
  return true;
}

function checkState() {
  if (!winShown && tiles.some(function (t) { return t.value >= WIN_VALUE; })) {
    winShown = true;
    showWinOverlay();
    return;
  }
  if (isGameOver()) {
    over = true;
    showOverlay(
      "Game over",
      "No moves left — final score: " + score + ".",
      "Try again",
      newGame,
      "Undo",
      undo
    );
  }
}

function showWinOverlay() {
  showOverlay(
    "You win!",
    "You reached " + WIN_VALUE + " — impressive! Keep going for an even higher score.",
    "Keep going",
    hideOverlay,
    "New Game",
    newGame
  );
}

function showOverlay(title, text, primaryLabel, primaryAction, secondaryLabel, secondaryAction) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayPrimaryEl.textContent = primaryLabel;
  overlaySecondaryEl.textContent = secondaryLabel;
  overlayPrimaryEl.onclick = primaryAction;
  overlaySecondaryEl.onclick = secondaryAction;
  overlayEl.hidden = false;
}

function hideOverlay() {
  overlayEl.hidden = true;
}

// --- Undo ------------------------------------------------------------------
function pushUndo() {
  const snapshot = grid.map(function (row) {
    return row.map(function (t) { return t ? t.value : 0; });
  });
  undoStack.push({ grid: snapshot, score: score });
  if (undoStack.length > 100) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) return;
  const state = undoStack.pop();

  tilesEl.innerHTML = "";
  tiles = [];
  grid = emptyGrid();

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = state.grid[r][c];
      if (value) {
        const tile = createTile(value, r, c);
        grid[r][c] = tile;
        tiles.push(tile);
      }
    }
  }

  score = state.score;
  updateScore();
  over = false;
  renderBoard();
  hideOverlay();
}

// --- Score UI --------------------------------------------------------------
function updateScore() {
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    saveBest();
  }
  bestEl.textContent = best;
}

// --- New game --------------------------------------------------------------
function newGame() {
  hideOverlay();
  undoStack = [];
  tiles = [];
  grid = emptyGrid();
  tilesEl.innerHTML = "";
  score = 0;
  over = false;
  winShown = false;
  updateScore();
  spawnTile(true);
  spawnTile(true);
}

// --- Input -----------------------------------------------------------------
const DIRS = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
  A: "left", D: "right", W: "up", S: "down",
};

document.addEventListener("keydown", function (e) {
  const dir = DIRS[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
});

// touch / swipe
let touchStart = null;

board.addEventListener("touchstart", function (e) {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

board.addEventListener("touchend", function (e) {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;

  const THRESHOLD = 24;
  if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

  let dir;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? "right" : "left";
  } else {
    dir = dy > 0 ? "down" : "up";
  }
  move(dir);
}, { passive: true });

newGameBtn.addEventListener("click", newGame);
undoBtn.addEventListener("click", undo);

// --- Boot ------------------------------------------------------------------
loadBest();
bestEl.textContent = best;
newGame();
