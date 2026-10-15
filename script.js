/* ================= XO ARENA ================= */
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = "xo-arena-v1";
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const MARK = {
  X: `<span class="mark"><svg viewBox="0 0 100 100"><path pathLength="1" d="M22 22L78 78"/><path pathLength="1" d="M78 22L22 78"/></svg></span>`,
  O: `<span class="mark"><svg viewBox="0 0 100 100"><circle pathLength="1" cx="50" cy="50" r="30"/></svg></span>`,
};

// ---------- Saved settings ----------
const S = { mode: "pvc", difficulty: "hard", human: "X", bestOf: 3, p1: "", p2: "", sound: true, theme: "dark", rec: { w: 0, l: 0, d: 0 } };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

// ---------- Game state ----------
let board, cur, starter = "X", over, thinking, hist, win, aiTimer, round = 1, last = null;
let ser = { X: 0, O: 0, D: 0 };
const cells = [];
const other = (p) => (p === "X" ? "O" : "X");
const pvc = () => S.mode === "pvc";
const need = () => Math.ceil(S.bestOf / 2);
const isComp = () => pvc() && cur !== S.human;
const nameOf = (p) => pvc() ? (p === S.human ? S.p1 || "You" : "Computer 🤖") : (p === "X" ? S.p1 || "Player 1" : S.p2 || "Player 2");

// ---------- Sound ----------
let ac;
function tone(f, d = .1, delay = 0) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f; g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}

// ---------- Confetti ----------
const cv = $("confetti"), cx = cv.getContext("2d");
function confetti() {
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ["#ff7a6b", "#4fe3c1", "#ffc16b", "#c9a6ff"];
  let ps = Array.from({ length: 150 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 18, vy: Math.random() * -15 - 4, s: Math.random() * 7 + 5, c: cols[Math.random() * 4 | 0] }));
  (function f() {
    cx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += .35; cx.fillStyle = p.c; cx.fillRect(p.x, p.y, p.s, p.s * .6); });
    ps = ps.filter((p) => p.y < cv.height + 20);
    ps.length ? requestAnimationFrame(f) : cx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// =============== CORE LOGIC ===============
function getResult(b) {
  for (const l of WINS) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { w: b[l[0]], line: l };
  return b.every(Boolean) ? { w: "draw", line: null } : null;
}

function startMatch() {
  ser = { X: 0, O: 0, D: 0 }; round = 1; starter = "X";
  $("menu").hidden = true; $("game").hidden = false;
  newRound();
}

function newRound() {
  clearTimeout(aiTimer);
  board = Array(9).fill(""); cur = starter; over = false; thinking = false; win = null; hist = [];
  $("modal").hidden = true;
  render();
  if (isComp()) scheduleAI();
}

function handleClick(i) {
  if (over || thinking || board[i] || isComp()) return;
  place(i);
}

function place(i) {
  board[i] = cur; hist.push({ i, p: cur });
  tone(cur === "X" ? 520 : 420, .09);
  const r = getResult(board);
  if (r) return endRound(r);
  cur = other(cur);
  render();
  if (isComp()) scheduleAI();
}

function endRound(r) {
  over = true; thinking = false; win = r.line; last = r.w;
  if (r.w === "draw") { ser.D++; if (pvc()) S.rec.d++; tone(260, .25, .1); }
  else {
    ser[r.w]++;
    const good = !pvc() || r.w === S.human;
    if (pvc()) good ? S.rec.w++ : S.rec.l++;
    if (good) { [660, 830, 990].forEach((f, k) => tone(f, .15, .1 + k * .12)); confetti(); }
    else [330, 262].forEach((f, k) => tone(f, .2, .1 + k * .18));
  }
  cur = r.w; save(); render();
  setTimeout(showModal, 1100);
}

function showModal() {
  if (!over) return;
  const champ = ser.X >= need() ? "X" : ser.O >= need() ? "O" : null;
  $("mTitle").textContent = champ ? `🏆 ${nameOf(champ)} wins the match!`
    : last === "draw" ? "It's a draw 🤝" : `${nameOf(last)} wins the round!`;
  $("mText").textContent = `Score ${ser.X} – ${ser.O}` + (ser.D ? ` · ${ser.D} draw${ser.D > 1 ? "s" : ""}` : "");
  $("mNext").textContent = champ ? "Rematch" : "Next round";
  $("mNext").dataset.champ = champ ? "1" : "";
  $("modal").hidden = false;
}

function undo() {
  if (over || thinking || hist.length < (pvc() ? 2 : 1)) return;
  const n = pvc() ? 2 : 1;
  for (let k = 0; k < n; k++) { const m = hist.pop(); board[m.i] = ""; cur = m.p; }
  render();
}

function hint() {
  if (over || thinking || isComp()) return;
  const m = bestMove(cur);
  cells[m].classList.add("hint");
  setTimeout(() => cells[m].classList.remove("hint"), 2000);
}

// =============== COMPUTER ===============
const empties = (b) => b.reduce((a, v, i) => (v ? a : [...a, i]), []);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function scheduleAI() {
  thinking = true; render();
  aiTimer = setTimeout(() => { thinking = false; if (!over) place(aiMove()); }, 600);
}

function winCell(p) {
  for (const i of empties(board)) {
    board[i] = p; const w = getResult(board)?.w === p; board[i] = "";
    if (w) return i;
  }
  return -1;
}

function aiMove() {
  const ai = cur;
  if (S.difficulty === "easy") return pick(empties(board));
  if (S.difficulty === "medium") {
    let m = winCell(ai); if (m >= 0) return m;
    m = winCell(other(ai)); if (m >= 0) return m;
    if (!board[4] && Math.random() < .7) return 4;
    return pick(empties(board));
  }
  return bestMove(ai);
}

function minimax(b, turn, ai, d, a, bt) {
  const r = getResult(b);
  if (r) return r.w === "draw" ? 0 : r.w === ai ? 10 - d : d - 10;
  const max = turn === ai; let best = max ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn; const s = minimax(b, other(turn), ai, d + 1, a, bt); b[i] = "";
    if (max) { best = Math.max(best, s); a = Math.max(a, best); } else { best = Math.min(best, s); bt = Math.min(bt, best); }
    if (bt <= a) break;
  }
  return best;
}

function bestMove(p) {
  if (empties(board).length === 9) return pick([0, 2, 4, 6, 8]);
  let top = -Infinity, moves = [];
  for (const i of empties(board)) {
    board[i] = p; const s = minimax(board, other(p), p, 1, -Infinity, Infinity); board[i] = "";
    if (s > top) { top = s; moves = [i]; } else if (s === top) moves.push(i);
  }
  return pick(moves);
}

// =============== RENDER ===============
function buildBoard() {
  for (let i = 0; i < 9; i++) {
    const c = document.createElement("button");
    c.className = "cell"; c.dataset.i = i;
    $("board").appendChild(c); cells.push(c);
  }
}

function render() {
  cells.forEach((c, i) => {
    const v = board[i];
    if (c.dataset.m !== v) { c.dataset.m = v; c.innerHTML = v ? MARK[v] : ""; c.className = "cell" + (v ? " " + v.toLowerCase() : ""); }
    c.disabled = !!v || over;
    c.classList.toggle("win", !!win && win.includes(i));
    c.setAttribute("aria-label", `Cell ${i + 1}, ${v || "empty"}`);
  });
  $("board").classList.toggle("won", !!win);
  $("board").classList.toggle("locked", thinking);

  $("nX").textContent = nameOf("X"); $("nO").textContent = nameOf("O");
  $("sX").textContent = ser.X; $("sO").textContent = ser.O;
  $("cardX").classList.toggle("on", !over && cur === "X");
  $("cardO").classList.toggle("on", !over && cur === "O");
  $("roundInfo").textContent = `Round ${round} · First to ${need()} · Draws ${ser.D}`;

  $("status").textContent = over
    ? (cur === "draw" ? "It's a draw!" : `${nameOf(cur)} wins! 🎉`)
    : thinking ? "Computer is thinking…"
    : `${nameOf(cur)}'s turn (${cur})`;

  $("undoBtn").disabled = over || thinking || hist.length < (pvc() ? 2 : 1);
  $("hintBtn").disabled = over || thinking || isComp();
  $("log").innerHTML = hist.map((m) => `<span class="chip ${m.p.toLowerCase()}">${m.p}→${m.i + 1}</span>`).join("");
}

// FIXED: removed the invalid selector line that crashed this function
function renderMenu() {
  $$(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === S.mode));
  $$("[data-pvc]").forEach((e) => (e.hidden = !pvc()));
  $$("[data-pvp]").forEach((e) => (e.hidden = pvc()));
  $("p1").placeholder = pvc() ? "Your name" : "Player 1";
  $$(".seg button").forEach((b) =>
    b.classList.toggle("active", String(S[b.parentElement.dataset.key]) === b.dataset.val)
  );
  $("rec").textContent = `Your record vs computer: ${S.rec.w}W · ${S.rec.l}L · ${S.rec.d}D`;
  $("soundBtn").textContent = S.sound ? "🔔" : "🔕";
  $("themeBtn").textContent = S.theme === "dark" ? "☀" : "☾";
  document.documentElement.dataset.theme = S.theme;
}

function toMenu() {
  clearTimeout(aiTimer); thinking = false;
  $("modal").hidden = true; $("game").hidden = true; $("menu").hidden = false;
  renderMenu();
}

// =============== EVENTS ===============
$("board").addEventListener("click", (e) => { const c = e.target.closest(".cell"); if (c) handleClick(+c.dataset.i); });
$$(".mode").forEach((b) => b.addEventListener("click", () => { S.mode = b.dataset.mode; save(); renderMenu(); }));
$$(".seg button").forEach((b) => b.addEventListener("click", () => {
  const v = b.dataset.val; S[b.parentElement.dataset.key] = isNaN(v) ? v : +v; save(); renderMenu();
}));
$("startBtn").addEventListener("click", () => { S.p1 = $("p1").value.trim(); S.p2 = $("p2").value.trim(); save(); startMatch(); });
$("menuBtn").addEventListener("click", toMenu);
$("mMenu").addEventListener("click", toMenu);
$("mNext").addEventListener("click", () => {
  if ($("mNext").dataset.champ) startMatch();
  else { starter = other(starter); round++; newRound(); }
});
$("restartBtn").addEventListener("click", newRound);
$("undoBtn").addEventListener("click", undo);
$("hintBtn").addEventListener("click", hint);
const toggleSound = () => { S.sound = !S.sound; save(); renderMenu(); tone(600, .08); };
const toggleTheme = () => { S.theme = S.theme === "dark" ? "light" : "dark"; save(); renderMenu(); };
$("soundBtn").addEventListener("click", toggleSound);
$("themeBtn").addEventListener("click", toggleTheme);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (k === "t") toggleTheme();
  else if (k === "s") toggleSound();
  if ($("game").hidden) { if (k === "enter") $("startBtn").click(); return; }
  if (!$("modal").hidden) { if (k === "enter" || k === "r") $("mNext").click(); return; }
  if (k >= "1" && k <= "9") handleClick(+k - 1);
  else if (k === "z") undo();
  else if (k === "h") hint();
  else if (k === "r") newRound();
  else if (k === "escape") toMenu();
});

// ---------- Init ----------
buildBoard();
$("p1").value = S.p1; $("p2").value = S.p2;
renderMenu();