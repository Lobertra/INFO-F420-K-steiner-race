/* Source */

// "Paper" = J. Lee, M. Brazil, C. Ras, D. A. Thomas. An improved exact algorithm for the Euclidean k-Steiner tree problem.
// Computational Geometry: Theory and Applications 135 (2026) 102268.
// This file only does the computations (geometry, pruning tests, race), app.js only displays them.


// Constant initiations

const SQRT3 = Math.sqrt(3);
const EPS = 1e-9; // tolerance for the rounding errors of floating-point numbers



// Euclidean length
function dist(u, v) {
  return Math.hypot(u.x - v.x, u.y - v.y);
}

// Cross product (u - o) x (v - o) = (ux - ox)(vy - oy) - (uy - oy)(vx - ox)
function cross(o, u, v) {
  return (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
}

// Rotation of p around center by an angle θ with x' = cx + dx·cos θ - dy·sin θ and y' = cy + dx·sin θ + dy·cos θ
function rotateAround(center, p, angle) {
  const dx = p.x - center.x, dy = p.y - center.y;
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

// Equilateral point e_uv: third vertex of the equilateral triangle u, v, e_uv, obtained by rotating v around u by ±π/3 (60°)
function equilateralPoint(u, v, ref, sameSide) {
  const e1 = rotateAround(u, v, Math.PI / 3);
  const e2 = rotateAround(u, v, -Math.PI / 3);
  const sideRef = Math.sign(cross(u, v, ref)); // sameSide = true gives the side of ref, false the opposite side
  const sideE1 = Math.sign(cross(u, v, e1));
  const e1IsSame = sideE1 === sideRef;
  if (sameSide) return e1IsSame ? e1 : e2;
  return e1IsSame ? e2 : e1;
}

// p is in the triangle uve (border included) if the three cross products never have opposite signs
function pointInTriangle(p, u, v, e) {
  const c1 = cross(u, v, p), c2 = cross(v, e, p), c3 = cross(e, u, p);
  const hasNeg = c1 < -EPS || c2 < -EPS || c3 < -EPS;
  const hasPos = c1 > EPS || c2 > EPS || c3 > EPS;
  return !(hasNeg && hasPos);
}

// Distance from p to the line uv = |cross(u, v, p)| / |uv| (area of the parallelogram divided by its base), it is d_p in the Trapezium Theorem
function distToLine(p, u, v) {
  return Math.abs(cross(u, v, p)) / dist(u, v);
}

// Intersection of the lines p1p2 and p3p4, solving p1 + t·d1 = p3 + t'·d2 gives t = cross(p3 - p1, d2) / cross(d1, d2)
function lineIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x; // never 0 here, the lines are never parallel (two Simpson lines or two diagonals of a convex quadrilateral)
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

// The segments uv and pq cross strictly if p and q are on opposite sides of uv, and u and v on opposite sides of pq
function segmentsCross(u, v, p, q) {
  const d1 = cross(u, v, p), d2 = cross(u, v, q);
  const d3 = cross(p, q, u), d4 = cross(p, q, v);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// Angle at the vertex v of the triangle uvp, cos θ = (w1 · w2) / (|w1| |w2|)
function angleAt(u, v, p) {
  const w1x = u.x - v.x, w1y = u.y - v.y, w2x = p.x - v.x, w2y = p.y - v.y;
  const cos = (w1x * w2x + w1y * w2y) / (Math.hypot(w1x, w1y) * Math.hypot(w2x, w2y));
  // cos is kept in [-1, 1] to avoid rounding errors
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}


/* Steiner points */

// Degree-3 Steiner point s of A, B, C, its three edges meet at angles of 2π/3 = 120°
function fermatPoint(A, B, C) {
  const limit = (2 * Math.PI) / 3 - 1e-9; // if one angle of the triangle is ≥ 2π/3, no point can see the three terminals at 120°
  if (angleAt(B, A, C) >= limit || angleAt(A, B, C) >= limit || angleAt(A, C, B) >= limit) {
    return null;
  }
  const eAB = equilateralPoint(A, B, C, false); // A, B and s are replaced by e_AB (opposite side to C) without changing the length, so s is on the Simpson line C-e_AB
  const eBC = equilateralPoint(B, C, A, false); // same with B and C, s is also on A-e_BC
  return lineIntersection(C, eAB, A, eBC); // so s is the intersection of the two lines
}

// Orders 4 vertices by their angle around their centre, [u, p, v, q] so that uv and pq are the two diagonals
function orderQuad(points, ids) {
  const cx = ids.reduce((s, i) => s + points[i].x, 0) / 4;
  const cy = ids.reduce((s, i) => s + points[i].y, 0) / 4;
  return ids.slice().sort( // counter-clockwise here instead of clockwise, both theorems are symmetric so the result is the same
    (i, j) =>
      Math.atan2(points[i].y - cy, points[i].x - cx) - Math.atan2(points[j].y - cy, points[j].x - cx)
  );
}


/* Pruning tests */

// Rhombus Test, x must be in the half of the rhombus on its side, the triangle u, v, e_uv (∠xuv and ∠xvu ≤ π/3)
function inRhombus(x, u, v) {
  const e = equilateralPoint(u, v, x, true);
  return pointInTriangle(x, u, v, e);
}

// Trapezium Test, d_x ≥ |uv| / (2√3) = (√3 / 6)|uv| = h / 3 with h = (√3 / 2)|uv| the height of the triangle u, v, e_uv
function inTrapeziumRegion(x, u, v) {
  return inRhombus(x, u, v) && distToLine(x, u, v) >= (SQRT3 / 6) * dist(u, v) - EPS; // in the rhombus and not in its lower third, so in the region T
}

// Vertices of the region T (for the drawing), its area is (2/3)² = 4/9 of the triangle u, v, e_uv
function regionT(x, u, v) {
  const e = equilateralPoint(u, v, x, true);
  return [
    { x: u.x + (e.x - u.x) / 3, y: u.y + (e.y - u.y) / 3 }, // the height grows linearly along a side, so u + (e - u) / 3 is at height h / 3
    { x: v.x + (e.x - v.x) / 3, y: v.y + (e.y - v.y) / 3 },
    e,
  ];
}


/* Minimum spanning tree */

// Length and edges of MST(P) with Prim's algorithm, in O(m²) for m points
function minimumSpanningTree(P) {
  const m = P.length;
  const inTree = new Array(m).fill(false); // point already in the tree
  const best = new Array(m).fill(Infinity); // shortest edge between the tree and each point
  const parent = new Array(m).fill(-1); // other end of this shortest edge
  const edges = [];
  let length = 0;
  best[0] = 0; // the tree starts from the first point
  for (let it = 0; it < m; it++) {
    // Add the closest point that is not in the tree yet
    let u = -1;
    for (let i = 0; i < m; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (parent[u] >= 0) {
      length += best[u];
      edges.push([parent[u], u]);
    }
    // Update the shortest edges with this new point
    for (let v = 0; v < m; v++) {
      if (!inTree[v]) {
        const w = dist(P[u], P[v]);
        if (w < best[v]) {
          best[v] = w;
          parent[v] = u;
        }
      }
    }
  }
  return { length, edges };
}


/* Race */

// Seeded pseudo-random generator (Mulberry32), the same seed gives the same order of the topologies to both methods
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lists and evaluates all the topologies of a round, every triple (Y) and every quadruple (X) of the vertices V
function evaluateCandidates(V, seed) {
  const n = V.length; // the terminals, plus the Steiner points already placed when k ≥ 2
  const cands = []; // C(n, 3) + C(n, 4) topologies, e.g. 120 + 210 = 330 for n = 10
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        cands.push({ type: "Y", ids: [i, j, k] });
        for (let l = k + 1; l < n; l++) cands.push({ type: "X", ids: [i, j, k, l] });
      }

  // Same random order for both methods (Fisher-Yates shuffle)
  const rnd = mulberry32(seed);
  for (let i = cands.length - 1; i > 0; i--) {
    const r = Math.floor(rnd() * (i + 1));
    [cands[i], cands[r]] = [cands[r], cands[i]];
  }

  for (const c of cands) {
    if (c.type === "Y") {
      const [A, B, C] = c.ids.map((i) => V[i]);
      const s = fermatPoint(A, B, C);
      if (!s) {
        c.pre = "angle ≥ 2π/3";
        continue;
      }
      c.s = s;
    } else {
      c.ord = orderQuad(V, c.ids);
      const [u, p, v, q] = c.ord.map((i) => V[i]);
      if (!segmentsCross(u, v, p, q)) { // a degree-4 Steiner point is the crossing point of the diagonals uv and pq, so u, p, v, q must be convex
        c.pre = "not convex";
        continue;
      }
      c.s = lineIntersection(u, v, p, q);

      c.oldChecks = 1; // old method, the Rhombus Test only restricts one neighbour (the root of the source branch)
      c.oldFail = inRhombus(p, u, v) ? null : "Rhombus Test";

      // New method, the same test first, then the region T on the four neighbours
      const checks = [
        [p, u, v, "Rhombus Test", inRhombus],
        [p, u, v, "Trapezium Test", inTrapeziumRegion], // T is inside the rhombus, so a rejection here is one that the old method would not make
        [q, u, v, "Trapezium Test", inTrapeziumRegion],
        [u, p, q, "Trapezium Test", inTrapeziumRegion],
        [v, p, q, "Trapezium Test", inTrapeziumRegion],
      ];
      c.newChecks = 0;
      c.newFail = null;
      for (const [x, end1, end2, reason, test] of checks) {
        c.newChecks++;
        if (!test(x, end1, end2)) {
          c.newFail = reason;
          break;
        }
      }
    }
    const ev = minimumSpanningTree(V.concat([c.s])); // every valid topology is evaluated (even the pruned ones), to check afterwards that no pruned topology was shorter
    c.length = ev.length;
    c.edges = ev.edges;
  }
  return cands;
}

// Adjusting the Steiner points (only for k ≥ 2), returns the new Steiner points and the number of MST evaluated
function refineSteinerPoints(P, S) {
  const n = P.length;
  S = S.map((s) => ({ x: s.x, y: s.y }));
  let evaluations = 1;
  let cur = minimumSpanningTree(P.concat(S));
  let moved = true;
  while (moved) { // stops, the length decreases at every kept move and cannot go below 0
    moved = false;
    for (let j = 0; j < S.length; j++) {
      const all = P.concat(S);
      const nb = cur.edges.filter(([i1, i2]) => i1 === n + j || i2 === n + j).map(([i1, i2]) => all[i1 === n + j ? i2 : i1]); // neighbours of the Steiner point j in the MST
      let s = null;
      if (nb.length === 3) s = fermatPoint(nb[0], nb[1], nb[2]); // degree 3, point at 2π/3 of its 3 neighbours
      if (nb.length === 4) { // degree 4, crossing point of the diagonals of its 4 neighbours (only if convex)
        const [u, p, v, q] = orderQuad(nb, [0, 1, 2, 3]).map((i) => nb[i]);
        if (segmentsCross(u, v, p, q)) s = lineIntersection(u, v, p, q);
      }
      if (!s) continue;
      const S2 = S.slice();
      S2[j] = s;
      const t = minimumSpanningTree(P.concat(S2));
      evaluations++;
      if (t.length < cur.length - EPS) { // a move is kept only if the tree gets shorter
        S = S2;
        cur = t;
        moved = true;
      }
    }
  }
  let changed = true; // remove the Steiner points of degree 1 or 2, a Steiner point has degree 3 or 4
  while (changed && S.length) {
    changed = false;
    const { edges } = minimumSpanningTree(P.concat(S));
    evaluations++;
    const deg = new Array(n + S.length).fill(0);
    for (const [i1, i2] of edges) {
      deg[i1]++;
      deg[i2]++;
    }
    const keep = S.filter((_, j) => deg[n + j] >= 3); // never longer, a leaf is just cut, and for degree 2 the edge uv is shorter than us + sv (triangle inequality)
    if (keep.length < S.length) {
      S = keep;
      changed = true;
    }
  }
  return { S, evaluations };
}

// Runs one method ("old" or "new") and builds its timeline of tasks
function runMethod(P, k, method) {
  const n = P.length;
  let S = []; // Steiner points already placed
  let cur = minimumSpanningTree(P);
  const tasks = [
    { kind: "base", status: "eval", cost: (n + 1) * (n + 1), length: cur.length, edges: cur.edges, V: P, S: [] }, // first task, MST of the terminals alone
  ];
  const rounds = [];

  for (let r = 1; r <= k; r++) { // k = 1 is an exact search in one round, for k ≥ 2 every round adds the best Steiner point
    const V = P.concat(S);
    const EVAL = (V.length + 1) * (V.length + 1); // cost of evaluating one tree (our choice), MST of m = V.length + 1 points, so m² units
    const cands = evaluateCandidates(V, 1234 + n + 97 * r + 7 * S.length);
    tasks.push({ kind: "round", status: "info", cost: 0, round: r, V });
    let best = null;
    for (const c of cands) {
      let task;
      if (c.pre) task = { c, status: "pre", reason: c.pre, cost: 1 }; // a geometric test costs 1 unit
      else if (c.type === "Y") task = { c, status: "eval", cost: 1 + EVAL };
      else {
        const fail = method === "old" ? c.oldFail : c.newFail;
        const checks = method === "old" ? c.oldChecks : c.newChecks;
        task = fail
          ? { c, status: "rej", reason: fail, cost: 1 + checks }
          : { c, status: "eval", cost: 1 + checks + EVAL }; // more tests for the new method, but fewer trees to evaluate
      }
      task.V = V;
      task.round = r;
      tasks.push(task);
      if (task.status === "eval" && (!best || c.length < best.length)) best = c;
    }
    rounds.push({ round: r, V, cands, best });

    if (!best || best.length >= cur.length - 1e-9) { // stops when a round does not shorten the tree
      tasks.push({ kind: "stop", status: "info", cost: 0, round: r });
      break;
    }
    S = S.concat([best.s]);
    if (k > 1) { // then all the Steiner points are adjusted, adding them one by one is our simplification, not the exact algorithm
      const adjusted = refineSteinerPoints(P, S);
      S = adjusted.S;
      cur = minimumSpanningTree(P.concat(S));
      tasks.push({
        kind: "refine", status: "eval", cost: adjusted.evaluations * EVAL, round: r,
        length: cur.length, edges: cur.edges, V: P.concat(S), S: S.slice(),
      });
    } else {
      cur = { length: best.length, edges: best.edges };
    }
  }

  // Each task ends at the sum of the costs of all the tasks up to it
  let t = 0;
  for (const task of tasks) {
    t += task.cost;
    task.end = t;
  }
  return { tasks, rounds, final: { length: cur.length, edges: cur.edges, V: P.concat(S), S } };
}

// Builds the whole race, the timelines of both methods on the same terminals P
function buildRace(P, k = 1) {
  const n = P.length;
  const base = minimumSpanningTree(P);
  const oldR = runMethod(P, k, "old");
  const newR = runMethod(P, k, "new");

  const result = {
    n, k, base,
    oldT: oldR.tasks, newT: newR.tasks,
    oldFinal: oldR.final, newFinal: newR.final,
    bestOld: oldR.final.length, bestNew: newR.final.length,
    candidatesOld: oldR.tasks.filter((t) => t.c).length,
    candidatesNew: newR.tasks.filter((t) => t.c).length,
    exact: k === 1,
    wrongNew: [], wrongOld: [],
  };

  // Check of the theorems (exact case k = 1), no pruned topology may be shorter than the optimum
  if (k === 1) {
    const cands = oldR.rounds[0].cands;
    let bestAll = base.length;
    for (const c of cands) if (c.length < bestAll) bestAll = c.length;
    result.bestAll = bestAll;
    result.wrongNew = cands.filter((c) => c.newFail && c.length < bestAll - 1e-9);
    result.wrongOld = cands.filter((c) => c.oldFail && c.length < bestAll - 1e-9);
  }
  return result;
}

// Export for Node (tests only), in the browser the functions are global
if (typeof module !== "undefined") {
  module.exports = {
    dist, cross, equilateralPoint, pointInTriangle, fermatPoint, orderQuad,
    inRhombus, inTrapeziumRegion, regionT, minimumSpanningTree, evaluateCandidates,
    refineSteinerPoints, runMethod, buildRace, mulberry32,
  };
}
