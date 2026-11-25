/* Constant initiations */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // Name of the cities (city1 = A, city2 = B...)
const $ = (id) => document.getElementById(id);

const state = {
  points: [], // position of points
  k: 1, // number of Steiner points
  race: null, // the race of an iteration
  clock: 0,  // counter of "work"
  playing: false,  // state of the run (pause or not)
  target: null, // target amount of units we want to go forward to
  panels: {}, // the two panels (old and new method)
  drag: null, // index of the city moved with the mouse
};


/* Cities */


function randomCities(n) {
  const pts = [];
  while (pts.length < n) {
    /* Making sure the points are visible on the map and not too close from each other */
    const p = { x: 0.08 + Math.random() * 0.84, y: 0.08 + Math.random() * 0.84 };
    if (pts.every((q) => dist(p, q) > 0.12))
      pts.push(p);
  }
  return pts;
}

function squareCities() {
  return [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ];
}

// Naming the points (including Steiner points)
function vertexName(i) {
  const n = state.points.length;
  return i < n ? LETTERS[i] : "S" + (i - n + 1);
}


/* State of the run */

// Reset all the counters and objects, tasks are the given tasks to do calculated by steiner.js, total is the number of candidates to examine
function freshRunState(tasks, total) {
  return {
    tasks,
    total,
    idx: 0, // next task
    examined: 0, // candidates already examined
    evaluated: 0,  // number of networks calculated
    rejRhombus: 0,  // candidates rejected by the Rhombus Test
    rejTrapezium: 0, // candidates rejected by the Trapezium Test
    pre: 0,   // candidates ignored for a geometrical reason (an angle higher than 120° or 4 cities forming a non-convex quadrilateral)
    round: 0,  // the current Steiner point we are searching for, out of the k Steiner points
    best: Infinity,   // length of the best network (starts at infinity to find a minimum)
    bestEdges: null,  // pairs of points (segments) of the current best network
    bestV: null, // points of the best network for now
    bestLabel: "", // interface labeling of the current optimal solution
    log: [],
  };
}
// Naming the type of node (Y or X)
function label(c) {
  return (c.type === "Y" ? "Y " : "X ") + "{" + c.ids.map(vertexName).join(",") + "}";
}


/* Replay of the race */

// Plays all the tasks that ended before the current clock (several per frame when the speed is high)
function advance(run) {
  while (run.idx < run.tasks.length && run.tasks[run.idx].end <= state.clock) {
    const task = run.tasks[run.idx++]; // takes the next task, then moves idx forward
    /* First task: MST of the terminals alone, it is the first best network */
    if (task.kind === "base") {
      run.evaluated++;
      run.best = task.length;
      run.bestEdges = task.edges;
      run.bestV = task.V;
      run.bestLabel = "no Steiner point";
      pushLog(run, "MST of the terminals: " + task.length.toFixed(3), "eval");
      continue;
    }
    /* Start of a round (k ≥ 2): search of the next Steiner point */
    if (task.kind === "round") {
      run.round = task.round;
      if (state.k > 1) pushLog(run, "— Round " + task.round + ": searching Steiner point " + task.round + " —", "round");
      continue;
    }
    /* No new Steiner point shortens the tree: the method stops with fewer than k Steiner points */
    if (task.kind === "stop") {
      pushLog(run, "Round " + task.round + ": no Steiner point shortens the tree, stop.", "round");
      continue;
    }
    /* Adjustment of the Steiner points (k ≥ 2), its tree always replaces the best one */
    if (task.kind === "refine") {
      run.evaluated++;
      run.best = task.length;
      run.bestEdges = task.edges;
      run.bestV = task.V;
      run.bestLabel = task.S.length + " Steiner point" + (task.S.length > 1 ? "s" : "");
      pushLog(run, "Steiner points adjusted: " + task.length.toFixed(3), "eval new-best");
      continue;
    }
    /* Otherwise the task is a topology (Y or X): skipped, pruned or evaluated */
    const c = task.c;
    run.examined++;
    if (task.status === "pre") {
      run.pre++;
      pushLog(run, label(c) + " — skipped (" + task.reason + ")", "pre");
    } else if (task.status === "rej") {
      if (task.reason === "Rhombus Test") run.rejRhombus++;
      else run.rejTrapezium++;
      pushLog(run, label(c) + " — pruned without evaluation (" + task.reason + ")", "rej");
    } else {
      run.evaluated++;
      /* 1e-12: tolerance, so that a rounding error is never counted as a shorter tree */
      if (c.length < run.best - 1e-12) {
        run.best = c.length;
        run.bestEdges = c.edges;
        run.bestV = task.V.concat([c.s]); // the new Steiner point is the last vertex
        run.bestLabel = label(c);
        pushLog(run, label(c) + " — evaluated: " + c.length.toFixed(3) + " ★ new best", "eval new-best");
      } else {
        pushLog(run, label(c) + " — evaluated: " + c.length.toFixed(3), "eval");
      }
    }
  }
}

// Adds a line at the top of the log (7 lines max), cls is its CSS class (its color)
function pushLog(run, text, cls) {
  run.log.unshift({ text, cls });
  if (run.log.length > 7) run.log.pop();
}

function currentTask(run) {
  return run.idx < run.tasks.length ? run.tasks[run.idx] : null;
}

function finished(run) {
  return run.idx >= run.tasks.length;
}


/* Initiation of the race */

// Computes a new race with steiner.js, then restarts it
function rebuild() {
  state.race = buildRace(state.points, state.k);
  resetClock();
}

// Restarts the race from the beginning (clock at 0 and new counters for both methods)
function resetClock() {
  state.clock = 0;
  state.playing = false;
  state.target = null;
  state.panels.old.run = freshRunState(state.race.oldT, state.race.candidatesOld);
  state.panels.new.run = freshRunState(state.race.newT, state.race.candidatesNew);
  $("play").textContent = "Play";
  const m = state.points.length + 1;
  $("stepSize").value = m * m + 10; // default step: a bit more than one tree evaluation ((n + 1)² units)
  $("summary").hidden = true;
  render();
}


/* Drawing */

// Reads the colors defined in style.css (light or dark theme)
function colors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (v) => cs.getPropertyValue(v).trim();
  return {
    city: get("--city"), tree: get("--tree"), best: get("--best"), eval: get("--eval"),
    rej: get("--rej"), zoneOld: get("--zoneOld"), zoneNew: get("--zoneNew"),
    text: get("--text"), muted: get("--muted"), bg: get("--bg"), panel: get("--panel"),
  };
}

// Adapts the resolution of the canvas to the screen (a Retina screen has 2 pixels per point, dpr = 2)
function sizeCanvas(canvas) {
  const dpr = window.devicePixelRatio;
  const w = canvas.clientWidth;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w };
}

// Unit square [0, 1]² to pixels, with a margin m = 24 px: x_screen = m + x·(w - 2m), y is inverted because the y axis of the screen goes down
function toScreen(p, w) {
  const m = 24;
  return { x: m + p.x * (w - 2 * m), y: m + (1 - p.y) * (w - 2 * m) };
}

// Inverse of toScreen: x = (x_screen - m) / (w - 2m), y = 1 - (y_screen - m) / (w - 2m)
function fromScreen(sx, sy, w) {
  const m = 24;
  return { x: (sx - m) / (w - 2 * m), y: 1 - (sy - m) / (w - 2 * m) };
}

// Draws a filled polygon (the rhombus and the region T)
function polygon(ctx, pts, w, fill, stroke) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = toScreen(p, w);
    i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawNetwork(ctx, w, V, edges, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  for (const [a, b] of edges) {
    const sa = toScreen(V[a], w), sb = toScreen(V[b], w);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
}

function drawSteinerPoints(ctx, w, V, col, size, withLabels) {
  const n = state.points.length;
  for (let i = n; i < V.length; i++) {
    const s = toScreen(V[i], w);
    ctx.fillStyle = col.best;
    ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
    if (withLabels) {
      ctx.fillStyle = col.text;
      ctx.font = "600 12px -apple-system, Segoe UI, sans-serif";
      ctx.fillText("S" + (i - n + 1), s.x + size / 2 + 3, s.y + size / 2 + 10);
    }
  }
}

// activeIds are the cities of the current topology, circled with the color ring
function drawCities(ctx, w, col, activeIds, ring) {
  state.points.forEach((p, i) => {
    const s = toScreen(p, w);
    const active = activeIds && activeIds.includes(i);
    ctx.beginPath();
    ctx.arc(s.x, s.y, active ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = col.city;
    ctx.fill();
    if (active) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = ring;
      ctx.stroke();
    }
    ctx.fillStyle = col.text;
    ctx.font = "600 13px -apple-system, Segoe UI, sans-serif";
    ctx.fillText(LETTERS[i], s.x + 9, s.y - 8);
  });
}

// Box shown at the top left of the drawing at the end of the race
function drawBanner(ctx, w, col, text) {
  ctx.font = "600 14px -apple-system, Segoe UI, sans-serif";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = col.panel;
  ctx.strokeStyle = col.best;
  ctx.lineWidth = 2;
  ctx.beginPath();
  /* roundRect does not exist in Safari before version 16: a normal rectangle is drawn instead */
  ctx.roundRect ? ctx.roundRect(10, 10, tw + 20, 30, 8) : ctx.rect(10, 10, tw + 20, 30);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col.text;
  ctx.fillText(text, 20, 30);
}

// Draws one panel: the current topology with its region, and the best tree so far
function drawPanel(method) {
  const panel = state.panels[method];
  const run = panel.run;
  const { ctx, w } = sizeCanvas(panel.canvas);
  const col = colors();
  ctx.clearRect(0, 0, w, w);

  /* At the end: only the best tree is shown, highlighted */
  if (finished(run)) {
    const V = run.bestV;
    drawNetwork(ctx, w, V, run.bestEdges, col.best, 4);
    drawSteinerPoints(ctx, w, V, col, 12, true);
    drawCities(ctx, w, col, null, null);
    const nS = V.length - state.points.length;
    const what = nS === 0 ? "no Steiner point" : nS + " Steiner point" + (nS > 1 ? "s" : "");
    drawBanner(ctx, w, col, "Best tree: " + run.best.toFixed(4) + " (" + what + ")");
    return;
  }

  /* The run is not finished, so there is always a current task, and it always has its vertices V */
  /* (the tasks without V, "round" and "stop", cost 0 units: they end at the same time as the task before them and are never the current one) */
  const task = currentTask(run);
  const c = task.c;
  const V = task.V;

  // Regions of the current topology (only for a valid degree-4 Steiner point)
  if (c && c.type === "X" && !c.pre) {
    const [U, Pp, W, Q] = c.ord.map((i) => V[i]);
    if (method === "old") {
      polygon(ctx, [U, W, equilateralPoint(U, W, Pp, true)], w, col.zoneOld, col.city);
    } else {
      polygon(ctx, [U, W, equilateralPoint(U, W, Pp, true)], w, col.zoneOld, null);
      polygon(ctx, [U, W, equilateralPoint(U, W, Q, true)], w, col.zoneOld, null);
      polygon(ctx, regionT(Pp, U, W), w, col.zoneNew, col.eval);
      polygon(ctx, regionT(Q, U, W), w, col.zoneNew, col.eval);
    }
  }

  // Best tree found so far
  if (run.bestEdges) {
    drawNetwork(ctx, w, run.bestV, run.bestEdges, col.best, 2.5);
    drawSteinerPoints(ctx, w, run.bestV, col, 10, false);
  }

  // Steiner points already placed during the previous rounds (k ≥ 2)
  if (V.length > state.points.length) drawSteinerPoints(ctx, w, V, col, 10, true);

  // Current topology: dotted lines from its Steiner point to its vertices
  if (c && c.s) {
    const tone = task.status === "rej" ? col.rej : col.eval;
    const s = toScreen(c.s, w);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.5;
    for (const i of c.ids) {
      const t = toScreen(V[i], w);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = tone;
    ctx.fill();
  }

  const ring = task.status === "rej" ? col.rej : task.status === "pre" ? col.muted : col.eval;
  drawCities(ctx, w, col, c ? c.ids : null, ring);
}

// Updates the counters, the progress bar and the log of one panel
function renderStats(method) {
  const panel = state.panels[method];
  const run = panel.run;
  const work = Math.min(state.clock, run.tasks[run.tasks.length - 1].end);
  const rows = [
    ["Topologies examined", run.examined + " / " + run.total],
    ["Trees evaluated", run.evaluated],
    ["Pruned (Rhombus Test)", run.rejRhombus],
    ["Pruned (Trapezium / extended Rhombus Test)", method === "new" ? run.rejTrapezium : "—"],
    ["Skipped (geometry)", run.pre],
    ["Work done", work.toLocaleString("en-US") + " units"],
    ["Best tree", isFinite(run.best) ? run.best.toFixed(4) + " (" + run.bestLabel + ")" : "—"],
  ];
  if (state.k > 1) rows.splice(0, 0, ["Round", (run.round || 1) + " / " + state.k]);
  panel.stats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  panel.bar.style.width = (100 * run.examined) / run.total + "%";
  panel.log.innerHTML = run.log.map((l) => `<li class="${l.cls}">${l.text}</li>`).join("");
  if (finished(run)) panel.stats.innerHTML += `<dt>Status</dt><dd><strong>Finished ✓</strong></dd>`;
}

// Shows the summary once both methods have finished
function renderSummary() {
  const o = state.panels.old.run, n = state.panels.new.run;
  if (!finished(o) || !finished(n)) return;
  const R = state.race;
  const uo = R.oldT[R.oldT.length - 1].end, un = R.newT[R.newT.length - 1].end;
  const gain = (100 * (1 - un / uo)).toFixed(1); // work saved = 1 - (work of the new method) / (work of the old method)
  const same = Math.abs(R.bestOld - R.bestNew) < 1e-9;
  const nS = R.newFinal.S.length;
  const used = nS === 0 ? "no Steiner point" : nS + " Steiner point" + (nS > 1 ? "s" : "");

  let checks;
  if (R.exact) {
    const noWrong = R.wrongNew.length === 0 && R.wrongOld.length === 0;
    checks = `<p class="${noWrong ? "ok" : "ko"}">${noWrong
      ? "✓ No pruned topology was shorter than the optimum: the pruning tests never removed the optimal solution."
      : "✗ A pruned topology was shorter than the optimum: to be checked!"}</p>
      <p>With one Steiner point, the search is <strong>exact</strong>: this tree is a minimum 1-Steiner tree.</p>`;
  } else {
    checks = `<p>With k ≥ 2, the page adds the Steiner points <strong>one by one</strong>, then moves each of them to its exact
      position for its neighbours (Theorem 2.4). The tree found is very good, but not necessarily a minimum k-Steiner tree,
      which only the complete algorithm of the paper (generation and concatenation phases) guarantees.</p>`;
  }

  const box = $("summary");
  box.hidden = false;
  box.innerHTML = `
    <h2>Race summary</h2>
    <p>Old method: <strong>${uo.toLocaleString("en-US")}</strong> units, ${o.evaluated} trees evaluated.<br>
       New method: <strong>${un.toLocaleString("en-US")}</strong> units, ${n.evaluated} trees evaluated.<br>
       Work saved by the new method: <strong>${gain}%</strong>.</p>
    <p class="${same ? "ok" : "ko"}">${same ? "✓ Both methods find the same tree" : "✗ The two methods find different trees"}:
       length ${R.bestNew.toFixed(4)} (${used}), against ${R.base.length.toFixed(4)} for the MST of the terminals.</p>
    ${checks}`;
}

// One frame: replays the finished tasks, then draws and updates both panels
function render() {
  for (const m of ["old", "new"]) {
    advance(state.panels[m].run);
    drawPanel(m);
    renderStats(m);
  }
  $("clock").textContent = Math.round(state.clock).toLocaleString("en-US");
  renderSummary();
}


/* Animation loop */

// Speed slider v from 0 to 100: 1.083^v units per frame, so from 1 (v = 0) to about 2900 (v = 100)
function speedUnits() {
  return Math.round(Math.pow(1.083, Number($("speed").value)));
}

// Called by the browser at every frame (about 60 times per second)
function loop() {
  if (state.playing) {
    const both = finished(state.panels.old.run) && finished(state.panels.new.run);
    if (both) {
      state.playing = false;
      $("play").textContent = "Play";
    } else {
      state.clock += speedUnits();
      /* "Step" button: stop exactly at the target */
      if (state.target !== null && state.clock >= state.target) {
        state.clock = state.target;
        state.target = null;
        state.playing = false;
        $("play").textContent = "Play";
      }
      render();
    }
  }
  requestAnimationFrame(loop);
}


/* Events */

// Lets the user move a city with the mouse (or a finger), every move computes a new race
function setupDragging(panel) {
  const canvas = panel.canvas;
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top, w: r.width };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const { sx, sy, w } = pick(e);
    let bestI = -1, bestD = 16; // a city is picked if the pointer is less than 16 px away from it
    state.points.forEach((p, i) => {
      const s = toScreen(p, w);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    if (bestI >= 0) {
      state.drag = bestI;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (state.drag === null) return;
    const { sx, sy, w } = pick(e);
    const p = fromScreen(sx, sy, w);
    state.points[state.drag] = { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }; // keeps the city inside the unit square
    rebuild();
  });
  const end = () => { state.drag = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

// Connects the buttons, creates the first cities and starts the animation loop
function init() {
  for (const el of document.querySelectorAll(".panel")) {
    const m = el.dataset.method;
    state.panels[m] = {
      canvas: el.querySelector("canvas"),
      stats: el.querySelector(".stats"),
      bar: el.querySelector(".bar"),
      log: el.querySelector(".log"),
      run: null,
    };
    setupDragging(state.panels[m]);
  }

  $("n").addEventListener("input", () => {
    $("nLabel").textContent = $("n").value;
    state.points = randomCities(Number($("n").value));
    rebuild();
  });
  $("k").addEventListener("change", () => {
    state.k = Number($("k").value);
    rebuild();
  });
  $("random").addEventListener("click", () => {
    state.points = randomCities(Number($("n").value));
    rebuild();
  });
  $("square").addEventListener("click", () => {
    $("n").value = 4;
    $("nLabel").textContent = "4";
    state.points = squareCities();
    rebuild();
  });
  $("play").addEventListener("click", () => {
    state.target = null;
    state.playing = !state.playing;
    $("play").textContent = state.playing ? "Pause" : "Play";
  });
  $("reset").addEventListener("click", resetClock);
  $("step").addEventListener("click", () => {
    state.target = state.clock + Math.max(1, Number($("stepSize").value) || 1); // an empty or negative step counts as 1 unit
    state.playing = true;
    $("play").textContent = "Pause";
  });
  window.addEventListener("resize", render);
  /* ?. : older versions of Safari do not have addEventListener here, the dark mode is then not followed live */
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", render);

  state.k = Number($("k").value);
  state.points = randomCities(Number($("n").value));
  rebuild();
  requestAnimationFrame(loop);
}

init();
