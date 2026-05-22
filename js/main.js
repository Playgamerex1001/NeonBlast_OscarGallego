const Screen = {
  MENU: "menu",
  LEVEL: "level",
};

/** @typedef {{ x: number, y: number, vx: number, vy: number, r: number }} Projectile */

/** @typedef {{ x: number, y: number, r: number, pendingRemoval: boolean }} Peg */

/** @typedef {"easy"|"normal"|"hard"} Difficulty */

const Difficulty = {
  EASY: "easy",
  NORMAL: "normal",
  HARD: "hard",
};

const SHOTS_BY_DIFFICULTY = {
  easy: 30,
  normal: 20,
  hard: 10,
};

const DIFFICULTY_LABEL = {
  easy: "Fácil",
  normal: "Normal",
  hard: "Difícil",
};

const CONST = {
  PROJECTILE_SPEED: 520,
  PROJECTILE_RADIUS: 8,
  BARREL_LENGTH: 52,
  BARREL_HALF_THICK: 8,
  GRAVITY: 880,
  PEG_RADIUS: 13,
  PEG_RESTITUTION: 0.86,
  /** Balde activo en todas las dificultades. */
  BUCKET_SPEED: 220,
  BUCKET_WIDTH_FRAC: 0.38,
  BUCKET_HEIGHT_FRAC: 0.07,
  BUCKET_BOTTOM_PAD: 10,
  /** Paredes verticales (fracción del ancho del canvas). */
  WALL_LEFT_FRAC: 0.2,
  WALL_RIGHT_FRAC: 0.8,
  /** Hueco entre pared y zona de pegs (fracción del ancho). */
  WALL_PEG_GAP_FRAC: 0.05,
  PEG_FIELD_Y_MIN: 0.22,
  PEG_FIELD_Y_MAX: 0.74,
  WALL_RESTITUTION: 0.82,
  SCORE_PER_PEG: 5,
  SCORE_TRIPLE_BONUS: 5,
  PEGS_FOR_TRIPLE_BONUS: 3,
};

/** Posición 0–1 dentro de la zona jugable (no del canvas entero). */
const PEG_LAYOUT_REL = [
  { nx: 0.15, ny: 0.12 },
  { nx: 0.5, ny: 0.08 },
  { nx: 0.85, ny: 0.14 },
  { nx: 0.28, ny: 0.28 },
  { nx: 0.72, ny: 0.3 },
  { nx: 0.5, ny: 0.38 },
  { nx: 0.18, ny: 0.48 },
  { nx: 0.82, ny: 0.5 },
  { nx: 0.38, ny: 0.58 },
  { nx: 0.62, ny: 0.6 },
  { nx: 0.5, ny: 0.72 },
  { nx: 0.32, ny: 0.82 },
];

/** @type {typeof Screen[keyof typeof Screen]} */
let currentScreen = Screen.MENU;

let worldW = 1;
let worldH = 1;

/** Último tamaño válido antes del sincronizado actual (para escalar pegs/proyectil al redimensionar). */
/** @type {{ w: number; h: number } | null} */
let lastCanvasWorld = null;

/** Aim desde el cañón hacia el puntero. */
let aimAngle = Math.PI / 2;

/** @type {{ x: number; y: number }} */
let cannonPivot = { x: 1, y: 40 };

/** @type {Projectile | null} */
let activeProjectile = null;

/** @type {Peg[]} */
let pegs = [];

/** @type {Difficulty} */
let selectedDifficulty = Difficulty.EASY;

let shotsRemaining = SHOTS_BY_DIFFICULTY.easy;

let score = 0;

/** Pegs acertados con el proyectil activo (mismo disparo). */
let pegsHitThisShot = 0;

/** @type {{ x: number; vx: number }} */
let bucket = { x: 0, vx: CONST.BUCKET_SPEED };

/** Partida en pausa (victoria o derrota). */
let levelPaused = false;

let animFrameId = 0;
let lastFrameTime = 0;

const menuEl = document.getElementById("screen-menu");
const levelEl = document.getElementById("screen-level");
const btnStart = document.getElementById("btn-start-level-1");
const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("game-canvas"));
const hudScoreEl = document.getElementById("hud-score");
const hudBallsEl = document.getElementById("hud-balls");
const hudDifficultyEl = document.getElementById("hud-difficulty");

let scoreBonusFlashUntil = 0;
const overlayWin = document.getElementById("overlay-win");
const overlayLose = document.getElementById("overlay-lose");
const overlayWinScoreEl = document.getElementById("overlay-win-score");
const overlayLoseScoreEl = document.getElementById("overlay-lose-score");
const btnRetryWin = document.getElementById("btn-retry-win");
const btnRetryLose = document.getElementById("btn-retry-lose");
const btnSettings = document.getElementById("btn-settings");
const btnSettingsClose = document.getElementById("btn-settings-close");
const overlaySettings = document.getElementById("overlay-settings");
const sliderMusic = /** @type {HTMLInputElement | null} */ (document.getElementById("slider-music"));
const sliderSfx = /** @type {HTMLInputElement | null} */ (document.getElementById("slider-sfx"));
const valueMusicEl = document.getElementById("value-music");
const valueSfxEl = document.getElementById("value-sfx");

const SETTINGS_STORAGE_KEY = "neonblast_settings_v1";

/** @type {{ music: number; sfx: number }} */
let gameSettings = { music: 80, sfx: 80 };

if (!menuEl || !levelEl || !btnStart || !canvas) {
  throw new Error("Faltan elementos del DOM esperados");
}

/** @type {CanvasRenderingContext2D} */
let ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
if (!ctx) {
  throw new Error("Canvas 2D no disponible");
}

const LEVEL_BG = "#0b1218";
const ACCENT = "#7cf0ff";
const BODY = "#3a4a5c";
const PROJECTILE_FILL = "#e8eef6";

function cannonYPx() {
  return Math.min(54, Math.max(34, Math.floor(worldH * 0.075)));
}

function canShoot() {
  return !levelPaused && activeProjectile === null && shotsRemaining > 0;
}

function allPegsCleared() {
  return pegs.length === 0 || pegs.every((p) => p.pendingRemoval);
}

function hideResultOverlays() {
  for (const el of [overlayWin, overlayLose]) {
    if (!el) continue;
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
  }
}

/**
 * @param {"win"|"lose"} result
 */
function updateResultOverlayScores() {
  const text = `Puntuación: ${score}`;
  if (overlayWinScoreEl) overlayWinScoreEl.textContent = text;
  if (overlayLoseScoreEl) overlayLoseScoreEl.textContent = text;
}

function showResultOverlay(result) {
  hideResultOverlays();
  const el = result === "win" ? overlayWin : overlayLose;
  if (!el) return;
  updateResultOverlayScores();
  el.classList.remove("is-hidden");
  el.setAttribute("aria-hidden", "false");
}

function pauseLevelWin() {
  if (levelPaused) return;
  levelPaused = true;
  stopLevelLoop();
  showResultOverlay("win");
  drawScene();
}

function pauseLevelLose() {
  if (levelPaused) return;
  levelPaused = true;
  stopLevelLoop();
  showResultOverlay("lose");
  drawScene();
}

function checkLevelEnd() {
  if (levelPaused || currentScreen !== Screen.LEVEL) return;

  if (allPegsCleared()) {
    pauseLevelWin();
    return;
  }

  if (!activeProjectile && shotsRemaining <= 0) {
    pauseLevelLose();
  }
}

function retryLevel() {
  hideResultOverlays();
  levelPaused = false;
  syncCanvasBackingStore();
  resetLevelGameplay();
  aimAngle = Math.PI / 2;
  drawScene();
  startLevelLoop();
}

function getPlayBounds() {
  const r = CONST.PROJECTILE_RADIUS;
  const wallL = worldW * CONST.WALL_LEFT_FRAC;
  const wallR = worldW * CONST.WALL_RIGHT_FRAC;
  const pegGap = worldW * CONST.WALL_PEG_GAP_FRAC;
  const pegMinX = wallL + pegGap;
  const pegMaxX = wallR - pegGap;
  return {
    wallL,
    wallR,
    ballLeft: wallL + r,
    ballRight: wallR - r,
    pegMinX,
    pegMaxX,
    pegMinY: worldH * CONST.PEG_FIELD_Y_MIN,
    pegMaxY: worldH * CONST.PEG_FIELD_Y_MAX,
  };
}

function loadGameSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.music === "number") {
      gameSettings.music = Math.max(0, Math.min(100, Math.round(data.music)));
    }
    if (typeof data.sfx === "number") {
      gameSettings.sfx = Math.max(0, Math.min(100, Math.round(data.sfx)));
    }
  } catch {
    /* ignorar datos corruptos */
  }
}

function saveGameSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings));
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * @param {"music"|"sfx"} key
 * @param {number} value
 */
function setVolumeSetting(key, value) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  gameSettings[key] = v;
  saveGameSettings();
}

function applySettingsToUi() {
  if (sliderMusic) {
    sliderMusic.value = String(gameSettings.music);
    sliderMusic.setAttribute("aria-valuenow", String(gameSettings.music));
  }
  if (sliderSfx) {
    sliderSfx.value = String(gameSettings.sfx);
    sliderSfx.setAttribute("aria-valuenow", String(gameSettings.sfx));
  }
  if (valueMusicEl) valueMusicEl.textContent = String(gameSettings.music);
  if (valueSfxEl) valueSfxEl.textContent = String(gameSettings.sfx);
}

function showSettingsOverlay() {
  if (!overlaySettings) return;
  applySettingsToUi();
  overlaySettings.classList.remove("is-hidden");
  overlaySettings.setAttribute("aria-hidden", "false");
  btnSettingsClose?.focus();
}

function hideSettingsOverlay() {
  if (!overlaySettings) return;
  overlaySettings.classList.add("is-hidden");
  overlaySettings.setAttribute("aria-hidden", "true");
}

/**
 * @param {HTMLInputElement} slider
 * @param {HTMLElement | null} valueEl
 * @param {"music"|"sfx"} key
 */
function bindVolumeSlider(slider, valueEl, key) {
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    setVolumeSetting(key, v);
    slider.setAttribute("aria-valuenow", String(gameSettings[key]));
    if (valueEl) valueEl.textContent = String(gameSettings[key]);
  });
}

function initSettingsUi() {
  loadGameSettings();
  applySettingsToUi();
  if (sliderMusic) bindVolumeSlider(sliderMusic, valueMusicEl, "music");
  if (sliderSfx) bindVolumeSlider(sliderSfx, valueSfxEl, "sfx");
  btnSettings?.addEventListener("click", showSettingsOverlay);
  btnSettingsClose?.addEventListener("click", hideSettingsOverlay);
}

function getSelectedDifficultyFromMenu() {
  const checked = document.querySelector('input[name="difficulty"]:checked');
  const value = checked?.value;
  if (value === Difficulty.NORMAL || value === Difficulty.HARD) return value;
  return Difficulty.EASY;
}

function shotsForDifficulty(diff) {
  return SHOTS_BY_DIFFICULTY[diff];
}

function getBucketChannel() {
  const { wallL, wallR } = getPlayBounds();
  return { wallL, wallR, channelW: wallR - wallL };
}

function getBucketMetrics() {
  const { wallL, wallR, channelW } = getBucketChannel();
  const width = Math.max(44, Math.min(channelW * CONST.BUCKET_WIDTH_FRAC, channelW - 16));
  const height = Math.max(26, worldH * CONST.BUCKET_HEIGHT_FRAC);
  const bottomPad = CONST.BUCKET_BOTTOM_PAD;
  const top = worldH - height - bottomPad;
  return {
    wallL,
    wallR,
    width,
    height,
    halfW: width * 0.5,
    top,
    bottom: top + height,
    minX: wallL + width * 0.5,
    maxX: wallR - width * 0.5,
  };
}

function initBucket() {
  const m = getBucketMetrics();
  bucket.x = (m.minX + m.maxX) * 0.5;
  if (Math.abs(bucket.vx) < 40) {
    bucket.vx = CONST.BUCKET_SPEED;
  }
}

function ensureBucketReady() {
  if (worldW < 20 || worldH < 20) return;
  const m = getBucketMetrics();
  if (m.maxX <= m.minX) return;
  if (bucket.x < m.minX || bucket.x > m.maxX || !Number.isFinite(bucket.x)) {
    initBucket();
  }
}

/**
 * @param {number} dt
 */
function tickBucket(dt) {
  ensureBucketReady();
  const m = getBucketMetrics();
  if (m.maxX <= m.minX) return;

  bucket.x += bucket.vx * dt;

  if (bucket.x < m.minX) {
    bucket.x = m.minX;
    bucket.vx = Math.abs(bucket.vx);
  } else if (bucket.x > m.maxX) {
    bucket.x = m.maxX;
    bucket.vx = -Math.abs(bucket.vx);
  }
}

/**
 * @param {Projectile} proj
 * @param {number} [prevY] posición Y del centro antes del último paso de física
 */
function projectileCaughtInBucket(proj, prevY) {
  const { halfW, top, bottom } = getBucketMetrics();
  const padX = 4;
  const inX = proj.x >= bucket.x - halfW + padX && proj.x <= bucket.x + halfW - padX;

  if (!inX) return false;

  const ballBottom = proj.y + proj.r;
  const ballTop = proj.y - proj.r;

  const insideBucket =
    ballBottom >= top - 2 && ballTop <= bottom + proj.r;

  if (insideBucket) return true;

  if (prevY !== undefined) {
    const prevBottom = prevY + proj.r;
    const crossedOpening = prevBottom < top + 6 && ballBottom >= top - 4;
    if (crossedOpening) return true;
  }

  return false;
}

function syncHud() {
  if (hudScoreEl) {
    hudScoreEl.textContent = `Puntos: ${score}`;
    const flash = performance.now() < scoreBonusFlashUntil;
    hudScoreEl.classList.toggle("is-bonus", flash);
  }
  if (hudBallsEl) {
    hudBallsEl.textContent = `Bolas: ${shotsRemaining}`;
    hudBallsEl.classList.toggle("is-empty", shotsRemaining <= 0);
  }
  if (hudDifficultyEl) {
    hudDifficultyEl.textContent = DIFFICULTY_LABEL[selectedDifficulty];
  }
}

/**
 * @param {Peg} peg
 */
function registerPegHit(peg) {
  if (peg.pendingRemoval) return;

  peg.pendingRemoval = true;
  pegsHitThisShot += 1;
  score += CONST.SCORE_PER_PEG;

  if (pegsHitThisShot === CONST.PEGS_FOR_TRIPLE_BONUS) {
    score += CONST.SCORE_TRIPLE_BONUS;
    scoreBonusFlashUntil = performance.now() + 600;
  }

  syncHud();
}

/**
 * @param {number} nx 0–1 dentro del campo de pegs
 * @param {number} ny 0–1 dentro del campo de pegs
 */
function pegPositionInField(nx, ny) {
  const b = getPlayBounds();
  return {
    x: b.pegMinX + nx * (b.pegMaxX - b.pegMinX),
    y: b.pegMinY + ny * (b.pegMaxY - b.pegMinY),
  };
}

function buildPegs() {
  pegs = PEG_LAYOUT_REL.map((rel) => {
    const pos = pegPositionInField(rel.nx, rel.ny);
    return {
      x: pos.x,
      y: pos.y,
      r: CONST.PEG_RADIUS,
      pendingRemoval: false,
    };
  });
}

function updateCannonPivot() {
  cannonPivot.x = worldW * 0.5;
  cannonPivot.y = cannonYPx();
}

/**
 * @param {number} prevW
 * @param {number} prevH
 */
function scaleLevelContents(prevW, prevH) {
  if (!(prevW > 1 && prevH > 1)) return;

  const sx = worldW / prevW;
  const sy = worldH / prevH;
  const sR = Math.min(sx, sy);

  updateCannonPivot();

  for (const pg of pegs) {
    pg.x *= sx;
    pg.y *= sy;
    pg.r *= sR;
  }

  const p = activeProjectile;
  if (p) {
    p.x *= sx;
    p.y *= sy;
    p.r *= sR;
    p.vx *= sx;
    p.vy *= sy;
  }
}

function finishTurn() {
  activeProjectile = null;
  pegs = pegs.filter((pg) => !pg.pendingRemoval);
  checkLevelEnd();
}

function endTurnDiscardBottom() {
  finishTurn();
}

/** Devuelve el proyectil gastado en este disparo al contador de bolas disponibles. */
function endTurnCaughtInBucket() {
  const maxShots = shotsForDifficulty(selectedDifficulty);
  shotsRemaining = Math.min(shotsRemaining + 1, maxShots);
  syncHud();
  finishTurn();
}

/**
 * @param {Projectile} proj
 * @param {number} [prevY]
 */
function tryResolveTurnAtBottom(proj, prevY) {
  if (projectileCaughtInBucket(proj, prevY)) {
    endTurnCaughtInBucket();
  } else {
    endTurnDiscardBottom();
  }
}

function applyPegBounce(proj, peg) {
  const dx = proj.x - peg.x;
  const dy = proj.y - peg.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) return;

  const nx = dx / len;
  const ny = dy / len;
  const overlap = proj.r + peg.r - len;
  proj.x += nx * overlap;
  proj.y += ny * overlap;

  let vn = proj.vx * nx + proj.vy * ny;
  if (vn >= 0) return;

  const e = CONST.PEG_RESTITUTION;
  proj.vx -= (1 + e) * vn * nx;
  proj.vy -= (1 + e) * vn * ny;

  registerPegHit(peg);
  checkLevelEnd();
}

/**
 * @param {Projectile} proj
 */
function clampProjectileWalls(proj) {
  const { ballLeft, ballRight } = getPlayBounds();
  const e = CONST.WALL_RESTITUTION;

  if (proj.x < ballLeft) {
    proj.x = ballLeft;
    proj.vx = Math.abs(proj.vx) * e;
  } else if (proj.x > ballRight) {
    proj.x = ballRight;
    proj.vx = -Math.abs(proj.vx) * e;
  }
  if (proj.y < proj.r) {
    proj.y = proj.r;
    proj.vy = Math.abs(proj.vy);
  }
}

/**
 * @param {Projectile} proj
 * @param {number} dt
 */
function tickProjectile(proj, dt) {
  const prevY = proj.y;

  proj.vy += CONST.GRAVITY * dt;
  proj.x += proj.vx * dt;
  proj.y += proj.vy * dt;

  clampProjectileWalls(proj);

  if (projectileCaughtInBucket(proj, prevY)) {
    endTurnCaughtInBucket();
    return;
  }

  for (let step = 0; step < 10; step++) {
    if (proj.y - proj.r > worldH) {
      tryResolveTurnAtBottom(proj, prevY);
      return;
    }

    /** @type {Peg | null} */
    let hit = null;
    let bestSq = Infinity;
    for (const peg of pegs) {
      const dx = peg.x - proj.x;
      const dy = peg.y - proj.y;
      const sumR = proj.r + peg.r;
      const sq = dx * dx + dy * dy;
      if (sq <= sumR * sumR && sq < bestSq) {
        hit = peg;
        bestSq = sq;
      }
    }

    if (!hit) break;
    applyPegBounce(proj, hit);
    clampProjectileWalls(proj);
  }

  if (projectileCaughtInBucket(proj, prevY)) {
    endTurnCaughtInBucket();
    return;
  }

  if (proj.y - proj.r > worldH) {
    tryResolveTurnAtBottom(proj, prevY);
  }
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
function pointerToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: worldW * 0.5, y: worldH * 0.5 };
  }
  const x = ((clientX - rect.left) / rect.width) * worldW;
  const y = ((clientY - rect.top) / rect.height) * worldH;
  return { x, y };
}

/**
 * @param {number} cx
 * @param {number} cy
 */
function updateAimFromPoint(cx, cy) {
  const dx = cx - cannonPivot.x;
  const dy = cy - cannonPivot.y;
  if (dx !== 0 || dy !== 0) {
    aimAngle = Math.atan2(dy, dx);
  }
}

/**
 * @param {PointerEvent} e
 */
function onPointerMove(e) {
  if (currentScreen !== Screen.LEVEL || levelPaused) return;
  const p = pointerToWorld(e.clientX, e.clientY);
  updateAimFromPoint(p.x, p.y);
}

function stopLevelLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }
  lastFrameTime = 0;
}

/**
 * @param {number} now
 */
function levelLoop(now) {
  animFrameId = 0;

  if (currentScreen !== Screen.LEVEL || levelPaused) {
    lastFrameTime = 0;
    return;
  }

  if (!lastFrameTime) lastFrameTime = now;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  tick(dt);
  drawScene();

  if (scoreBonusFlashUntil > 0 && performance.now() >= scoreBonusFlashUntil) {
    scoreBonusFlashUntil = 0;
    syncHud();
  }

  animFrameId = requestAnimationFrame(levelLoop);
}

function startLevelLoop() {
  if (animFrameId) return;
  lastFrameTime = 0;
  animFrameId = requestAnimationFrame(levelLoop);
}

/**
 * @param {number} dt
 */
function tick(dt) {
  tickBucket(dt);
  if (activeProjectile) {
    tickProjectile(activeProjectile, dt);
  }
}

function drawScene() {
  if (!ctx) return;

  ctx.fillStyle = LEVEL_BG;
  ctx.fillRect(0, 0, worldW, worldH);

  drawSideWalls();
  drawBucketZone();

  for (const peg of pegs) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);

    if (peg.pendingRemoval) {
      ctx.fillStyle = "rgba(124, 240, 255, 0.22)";
      ctx.strokeStyle = "rgba(248, 198, 90, 0.75)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#273341";
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }

  drawBucket();

  if (activeProjectile) {
    const p = activeProjectile;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = PROJECTILE_FILL;
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawCannon();

  drawTurnHint();
}

function drawBucketZone() {
  if (!ctx) return;

  const { wallL, wallR } = getBucketChannel();
  const m = getBucketMetrics();

  ctx.fillStyle = "rgba(20, 28, 36, 0.85)";
  ctx.fillRect(wallL, m.top - 6, wallR - wallL, worldH - (m.top - 6));

  ctx.strokeStyle = "rgba(124, 240, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wallL, m.top - 4);
  ctx.lineTo(wallR, m.top - 4);
  ctx.stroke();
}

function drawBucket() {
  if (!ctx) return;

  ensureBucketReady();
  const { width, height, halfW, top, minX, maxX } = getBucketMetrics();
  if (maxX <= minX) return;

  const cx = Math.max(minX, Math.min(maxX, bucket.x));
  const lip = Math.min(10, halfW * 0.2);

  ctx.save();

  ctx.shadowColor = "rgba(124, 240, 255, 0.45)";
  ctx.shadowBlur = 10;

  ctx.fillStyle = "#3d5168";
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(cx - halfW + lip, top);
  ctx.lineTo(cx + halfW - lip, top);
  ctx.lineTo(cx + halfW, top + height);
  ctx.lineTo(cx - halfW, top + height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(124, 240, 255, 0.35)";
  ctx.fillRect(cx - halfW + lip * 1.2, top + 3, width - lip * 2.4, 5);

  ctx.strokeStyle = "#f8c65a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfW + lip * 1.5, top + 6);
  ctx.lineTo(cx + halfW - lip * 1.5, top + 6);
  ctx.stroke();

  ctx.restore();
}

function drawSideWalls() {
  if (!ctx) return;

  const { wallL, wallR } = getPlayBounds();
  const wallW = Math.max(6, Math.floor(worldW * 0.018));

  ctx.fillStyle = "#141c24";
  ctx.fillRect(0, 0, wallL, worldH);
  ctx.fillRect(wallR, 0, worldW - wallR, worldH);

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = wallW;
  ctx.lineCap = "butt";

  ctx.beginPath();
  ctx.moveTo(wallL, 0);
  ctx.lineTo(wallL, worldH);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(wallR, 0);
  ctx.lineTo(wallR, worldH);
  ctx.stroke();

  ctx.strokeStyle = "rgba(124, 240, 255, 0.12)";
  ctx.lineWidth = 1;
  const gap = worldW * CONST.WALL_PEG_GAP_FRAC;
  const guideL = wallL + gap;
  const guideR = wallR - gap;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(guideL, worldH * CONST.PEG_FIELD_Y_MIN);
  ctx.lineTo(guideL, worldH * CONST.PEG_FIELD_Y_MAX);
  ctx.moveTo(guideR, worldH * CONST.PEG_FIELD_Y_MIN);
  ctx.lineTo(guideR, worldH * CONST.PEG_FIELD_Y_MAX);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Indicador de turno junto al cañón.
 * Preferimos sólo comportamiento sin texto invasivo: indicamos “no disparar” con retícula en cañón.
 */
function drawTurnHint() {
  if (!ctx) return;

  // Disparo bloqueado: pequeño “LED” sobre el centro — sin texto que ensucie.
  const busy = activeProjectile !== null;
  const ready = canShoot();
  ctx.save();
  ctx.fillStyle = busy ? "#f8c65a" : ready ? "#4af2a8" : "#6a7380";
  ctx.beginPath();
  ctx.arc(worldW * 0.5, cannonPivot.y - 22, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCannon() {
  if (!ctx) return;

  const { BARREL_LENGTH, BARREL_HALF_THICK } = CONST;
  const cx = cannonPivot.x;
  const cy = cannonPivot.y;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(aimAngle);

  const dimmed = activeProjectile !== null;
  ctx.globalAlpha = dimmed ? 0.55 : 1;

  ctx.fillStyle = BODY;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-12, -14);
  ctx.lineTo(12, -14);
  ctx.lineTo(18, 12);
  ctx.lineTo(-18, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, -BARREL_HALF_THICK, BARREL_LENGTH, BARREL_HALF_THICK * 2);
  ctx.strokeRect(0, -BARREL_HALF_THICK, BARREL_LENGTH, BARREL_HALF_THICK * 2);

  ctx.fillStyle = "#1a242d";
  ctx.beginPath();
  ctx.arc(BARREL_LENGTH - 2, 0, BARREL_HALF_THICK + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.stroke();

  ctx.restore();

  ctx.globalAlpha = 1;
}

function fireProjectile() {
  if (!canShoot()) return;

  pegsHitThisShot = 0;
  shotsRemaining -= 1;
  syncHud();

  const dist = CONST.BARREL_LENGTH + CONST.PROJECTILE_RADIUS + 3;
  const speed = CONST.PROJECTILE_SPEED;
  activeProjectile = {
    x: cannonPivot.x + Math.cos(aimAngle) * dist,
    y: cannonPivot.y + Math.sin(aimAngle) * dist,
    vx: Math.cos(aimAngle) * speed,
    vy: Math.sin(aimAngle) * speed,
    r: CONST.PROJECTILE_RADIUS,
  };
}

/**
 * @param {PointerEvent} e
 */
function onPointerDown(e) {
  if (currentScreen !== Screen.LEVEL || levelPaused) return;
  if (!e.isPrimary) return;
  if (!canShoot()) return;

  canvas.setPointerCapture(e.pointerId);
  fireProjectile();
}

function syncCanvasBackingStore() {
  const wrap = canvas.parentElement;
  if (!wrap) return;

  const prevW = worldW;
  const prevH = worldH;

  const rect = wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  worldW = w;
  worldH = h;
  updateCannonPivot();

  if (currentScreen === Screen.LEVEL) {
    if (lastCanvasWorld && pegs.length) {
      const sx = worldW / prevW;
      bucket.x *= sx;
      bucket.vx *= sx;

      if (activeProjectile) {
        scaleLevelContents(prevW, prevH);
        const { ballLeft, ballRight } = getPlayBounds();
        const p = activeProjectile;
        p.x = Math.max(ballLeft, Math.min(ballRight, p.x));
      }
      buildPegs();
    } else if (!lastCanvasWorld) {
      initBucket();
    }

    ensureBucketReady();
    const m = getBucketMetrics();
    if (m.maxX > m.minX) {
      bucket.x = Math.max(m.minX, Math.min(m.maxX, bucket.x));
    }
    if (Math.abs(bucket.vx) < 40) bucket.vx = CONST.BUCKET_SPEED;
  }

  lastCanvasWorld = { w: worldW, h: worldH };

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetLevelGameplay() {
  activeProjectile = null;
  levelPaused = false;
  score = 0;
  pegsHitThisShot = 0;
  scoreBonusFlashUntil = 0;
  shotsRemaining = shotsForDifficulty(selectedDifficulty);
  syncHud();
  updateCannonPivot();
  initBucket();
  buildPegs();
  lastCanvasWorld = { w: worldW, h: worldH };
}

/**
 * @param {typeof Screen[keyof typeof Screen]} screen
 */
function setScreen(screen) {
  const isMenu = screen === Screen.MENU;
  currentScreen = screen;

  menuEl.classList.toggle("is-hidden", !isMenu);
  levelEl.classList.toggle("is-hidden", isMenu);
  menuEl.setAttribute("aria-hidden", String(!isMenu));
  levelEl.setAttribute("aria-hidden", String(isMenu));

  if (isMenu) {
    hideSettingsOverlay();
    stopLevelLoop();
    hideResultOverlays();
    levelPaused = false;
    activeProjectile = null;
    pegs = [];
    score = 0;
    pegsHitThisShot = 0;
    scoreBonusFlashUntil = 0;
    lastCanvasWorld = null;
    return;
  }

  requestAnimationFrame(() => {
    hideResultOverlays();
    syncCanvasBackingStore();
    resetLevelGameplay();
    aimAngle = Math.PI / 2;
    drawScene();
    startLevelLoop();
  });
}

window.addEventListener("pointermove", onPointerMove);

canvas.addEventListener("pointerdown", onPointerDown);

btnStart.addEventListener("click", () => {
  selectedDifficulty = getSelectedDifficultyFromMenu();
  setScreen(Screen.LEVEL);
});

if (btnRetryWin) btnRetryWin.addEventListener("click", retryLevel);
if (btnRetryLose) btnRetryLose.addEventListener("click", retryLevel);

window.addEventListener("resize", () => {
  if (currentScreen === Screen.LEVEL && !levelPaused) {
    syncCanvasBackingStore();
    drawScene();
  }
});

initSettingsUi();
