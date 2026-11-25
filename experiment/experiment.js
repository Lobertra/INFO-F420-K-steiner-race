// Experiment for the report, runs the race on random terminals and measures the pruning
// Usage (from the experiment folder), node experiment.js > results.csv   (takes about 40 seconds)
const S = require("../race/steiner.js");
const rnd = S.mulberry32(420);
const rows = ["k,n,instances,x_valid,x_pruned_old,x_pruned_new,work_old,work_new,trees_old,trees_new,same_tree,wrong_prunings"];
for (let k = 1; k <= 4; k++) {
  for (let n = 4; n <= 12; n++) {
    const N = k === 1 ? 300 : 100;
    let xv = 0, po = 0, pn = 0, wo = 0, wn = 0, to = 0, tn = 0, same = 0, wrong = 0;
    for (let t = 0; t < N; t++) {
      const P = [];
      while (P.length < n) { const p = { x: 0.08 + rnd() * 0.84, y: 0.08 + rnd() * 0.84 }; if (P.every((q) => S.dist(p, q) > 0.12)) P.push(p); }
      const R = S.buildRace(P, k);
      for (const task of R.oldT) if (task.c && task.c.type === "X" && task.status !== "pre") { xv++; if (task.status === "rej") po++; }
      for (const task of R.newT) if (task.c && task.c.type === "X" && task.status !== "pre" && task.status === "rej") pn++;
      wo += R.oldT.at(-1).end; wn += R.newT.at(-1).end;
      to += R.oldT.filter((x) => x.status === "eval").length; tn += R.newT.filter((x) => x.status === "eval").length;
      if (Math.abs(R.bestOld - R.bestNew) < 1e-9) same++;
      wrong += R.wrongNew.length + R.wrongOld.length;
    }
    rows.push([k, n, N, xv, po, pn, wo, wn, to, tn, same, wrong].join(","));
  }
}
console.log(rows.join("\n"));
