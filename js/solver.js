/*
 * Motore di RdPosti: geometria dell'aula + ricerca della disposizione migliore.
 *
 * 1. buildLayout(): dai banchi sulla griglia ricava gruppi (Union-Find),
 *    file (dalla prima all'ultima, rispetto alla cattedra) e le relazioni
 *    tra ogni coppia di posti (accanto, davanti/dietro, diagonale, stesso gruppo).
 * 2. solve(): parte da una permutazione casuale e la migliora con
 *    simulated annealing scambiando coppie di posti, minimizzando le penalità.
 */
(function (root) {
  const UnionFind =
    (root.RdPosti && root.RdPosti.UnionFind) ||
    (typeof require !== 'undefined' ? require('./unionfind.js').UnionFind : null);

  // Relazioni tra due posti
  const REL = { NONE: 0, SIDE: 1, FRONTBACK: 2, DIAG: 3, GROUP: 4 };

  const RULE_TYPES = {
    separa:   { label: 'Non devono stare vicini', pair: true,  icon: '⛔' },
    vicini:   { label: 'Devono stare vicini',     pair: true,  icon: '🤝' },
    prima:    { label: 'In prima fila',            pair: false, icon: '⬆️' },
    noPrima:  { label: 'Non in prima fila',        pair: false, icon: '🚫⬆️' },
    ultima:   { label: 'In ultima fila',           pair: false, icon: '⬇️' },
    noUltima: { label: 'Non in ultima fila',       pair: false, icon: '🚫⬇️' },
  };

  // Penalità: più alto = più grave
  const W = {
    separa: { [REL.SIDE]: 1000, [REL.FRONTBACK]: 450, [REL.DIAG]: 150, [REL.GROUP]: 80, [REL.NONE]: 0 },
    vicini: { [REL.SIDE]: 0, [REL.GROUP]: 120, [REL.FRONTBACK]: 180, [REL.DIAG]: 220, [REL.NONE]: 350 },
    rowStep: 500, // per ogni fila di distanza dalla fila richiesta
    rowBan: 600,
  };

  const REL_TEXT = {
    [REL.SIDE]: 'sono seduti accanto',
    [REL.FRONTBACK]: 'sono uno davanti all’altro',
    [REL.DIAG]: 'sono in diagonale',
    [REL.GROUP]: 'sono nello stesso gruppo di banchi',
    [REL.NONE]: 'sono lontani',
  };

  /**
   * @param {Array<{id,type,c,r,w,h}>} items  banchi ('desk') e cattedra ('teacher')
   * @returns {{seats, groupCount, rel, rank, maxRank}}
   */
  function buildLayout(items) {
    const desks = items.filter((it) => it.type === 'desk');
    const n = desks.length;
    const byCell = new Map(desks.map((d, i) => [d.c + ',' + d.r, i]));

    // Gruppi: banchi adiacenti (sopra/sotto/destra/sinistra) si uniscono
    const uf = new UnionFind(n);
    desks.forEach((d, i) => {
      const right = byCell.get(d.c + 1 + ',' + d.r);
      const down = byCell.get(d.c + ',' + (d.r + 1));
      if (right !== undefined) uf.union(i, right);
      if (down !== undefined) uf.union(i, down);
    });
    const groupIds = new Map();
    const seats = desks.map((d, i) => {
      const g = uf.find(i);
      if (!groupIds.has(g)) groupIds.set(g, groupIds.size);
      return {
        id: d.id,
        c: d.c,
        r: d.r,
        group: groupIds.get(g),
        join: {
          l: byCell.has(d.c - 1 + ',' + d.r),
          r: byCell.has(d.c + 1 + ',' + d.r),
          t: byCell.has(d.c + ',' + (d.r - 1)),
          b: byCell.has(d.c + ',' + (d.r + 1)),
        },
      };
    });

    // File: righe della griglia occupate, ordinate dalla cattedra verso il fondo
    const rowsUsed = [...new Set(seats.map((s) => s.r))].sort((a, b) => a - b);
    const teacher = items.find((it) => it.type === 'teacher');
    if (teacher && rowsUsed.length > 1) {
      const teacherRow = teacher.r + (teacher.h - 1) / 2;
      const mid = (rowsUsed[0] + rowsUsed[rowsUsed.length - 1]) / 2;
      if (teacherRow > mid) rowsUsed.reverse(); // cattedra in basso: la "prima fila" è in basso
    }
    const rankOfRow = new Map(rowsUsed.map((r, i) => [r, i]));
    const rank = seats.map((s) => rankOfRow.get(s.r));
    seats.forEach((s, i) => (s.rank = rank[i]));
    const maxRank = Math.max(0, rowsUsed.length - 1);

    // Matrice delle relazioni tra posti
    const rel = Array.from({ length: n }, () => new Uint8Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = seats[i], b = seats[j];
        const dc = Math.abs(a.c - b.c);
        const dr = Math.abs(a.r - b.r);
        const dRank = Math.abs(rank[i] - rank[j]);
        let k = REL.NONE;
        if (dr === 0 && dc === 1) k = REL.SIDE;
        else if (dc === 0 && dRank === 1 && dr <= 2) k = REL.FRONTBACK;
        else if (dc === 1 && dRank === 1 && dr <= 2) k = REL.DIAG;
        else if (a.group === b.group) k = REL.GROUP;
        rel[i][j] = rel[j][i] = k;
      }
    }

    return { seats, groupCount: groupIds.size, rel, rank, maxRank };
  }

  /** Divide il testo "Nome Cognome, Nome Cognome" in una lista di studenti. */
  function parseNames(text) {
    return String(text || '')
      .split(/[,;\n]+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((full) => {
        const parts = full.split(' ');
        return { full, nome: parts[0], cognome: parts.slice(1).join(' ') };
      });
  }

  /** Mulberry32: generatore pseudo-casuale con seme (utile per i test). */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Trasforma le regole testuali in regole con indici, scartando quelle non valide. */
  function compileRules(rules, students) {
    const idx = new Map(students.map((s, i) => [s.full.toLowerCase(), i]));
    const out = [];
    for (const rule of rules) {
      const t = RULE_TYPES[rule.type];
      if (!t) continue;
      const a = idx.get(String(rule.a || '').toLowerCase());
      const b = t.pair ? idx.get(String(rule.b || '').toLowerCase()) : -1;
      if (a === undefined || (t.pair && (b === undefined || a === b))) continue;
      out.push({ type: rule.type, a, b, src: rule });
    }
    return out;
  }

  /** Penalità di una singola regola data la posizione (pos[studente] = posto). */
  function ruleCost(rule, pos, layout) {
    const pa = pos[rule.a];
    if (pa < 0) return 0;
    switch (rule.type) {
      case 'separa':
      case 'vicini': {
        const pb = pos[rule.b];
        if (pb < 0) return 0;
        return W[rule.type][layout.rel[pa][pb]];
      }
      case 'prima':
        return W.rowStep * layout.rank[pa];
      case 'ultima':
        return W.rowStep * (layout.maxRank - layout.rank[pa]);
      case 'noPrima':
        return layout.maxRank > 0 && layout.rank[pa] === 0 ? W.rowBan : 0;
      case 'noUltima':
        return layout.maxRank > 0 && layout.rank[pa] === layout.maxRank ? W.rowBan : 0;
    }
    return 0;
  }

  function describeViolation(rule, pos, layout, students) {
    const A = students[rule.a].full;
    const pa = pos[rule.a];
    switch (rule.type) {
      case 'separa':
        return `${A} e ${students[rule.b].full} ${REL_TEXT[layout.rel[pa][pos[rule.b]]]}`;
      case 'vicini':
        return `${A} e ${students[rule.b].full} non sono accanto (${REL_TEXT[layout.rel[pa][pos[rule.b]]]})`;
      case 'prima':
        return `${A} è in fila ${layout.rank[pa] + 1} invece che in prima`;
      case 'ultima':
        return `${A} è in fila ${layout.rank[pa] + 1} invece che in ultima`;
      case 'noPrima':
        return `${A} è in prima fila`;
      case 'noUltima':
        return `${A} è in ultima fila`;
    }
    return '';
  }

  /**
   * Valuta una disposizione già fatta.
   * @param {number[]} pos pos[studente] = indice del posto, -1 se senza posto
   */
  function evaluate(pos, layout, compiled, students) {
    let cost = 0;
    const violations = [];
    for (const rule of compiled) {
      const c = ruleCost(rule, pos, layout);
      if (c > 0) {
        cost += c;
        violations.push({
          rule: rule.src,
          cost: c,
          severe: c >= 400,
          students: RULE_TYPES[rule.type].pair ? [rule.a, rule.b] : [rule.a],
          text: describeViolation(rule, pos, layout, students),
        });
      }
    }
    violations.sort((x, y) => y.cost - x.cost);
    return { cost, violations };
  }

  /**
   * Trova una disposizione casuale che rispetti il più possibile le regole.
   * @returns {{pos:number[], seatOf:number[], cost, violations}}
   *   pos[studente] = posto, seatOf[posto] = studente (-1 se vuoto)
   */
  function solve({ layout, students, rules, rng = Math.random, iterations = 25000, restarts = 4 }) {
    const nSeats = layout.seats.length;
    const nStud = students.length;
    const compiled = compileRules(rules, students);

    // Indice: quali regole toccano ciascuno studente
    const rulesOf = Array.from({ length: nStud }, () => []);
    compiled.forEach((r, i) => {
      rulesOf[r.a].push(i);
      if (r.b >= 0) rulesOf[r.b].push(i);
    });

    const ruleCostAt = (i, pos) => ruleCost(compiled[i], pos, layout);

    let best = null;
    for (let run = 0; run < restarts; run++) {
      // Permutazione casuale (Fisher-Yates) di studenti + posti vuoti (-1)
      const seatOf = new Array(Math.max(nSeats, nStud)).fill(-1);
      for (let s = 0; s < nStud; s++) seatOf[s] = s;
      for (let i = seatOf.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [seatOf[i], seatOf[j]] = [seatOf[j], seatOf[i]];
      }
      // Se gli studenti sono più dei posti, gli "slot" oltre nSeats sono senza posto
      const pos = new Array(nStud).fill(-1);
      seatOf.forEach((s, seat) => {
        if (s >= 0) pos[s] = seat < nSeats ? seat : -1;
      });

      let cost = 0;
      for (let i = 0; i < compiled.length; i++) cost += ruleCostAt(i, pos);
      let runBest = { cost, seatOf: seatOf.slice() };

      if (compiled.length > 0 && seatOf.length > 1) {
        const T0 = 600, T1 = 0.5;
        const len = seatOf.length;
        for (let it = 0; it < iterations && runBest.cost > 0; it++) {
          const T = T0 * Math.pow(T1 / T0, it / iterations);
          const x = Math.floor(rng() * len);
          let y = Math.floor(rng() * (len - 1));
          if (y >= x) y++;
          const sx = seatOf[x], sy = seatOf[y];
          if (sx < 0 && sy < 0) continue;

          // Regole coinvolte nello scambio
          const touched = new Set();
          if (sx >= 0) rulesOf[sx].forEach((i) => touched.add(i));
          if (sy >= 0) rulesOf[sy].forEach((i) => touched.add(i));
          if (touched.size === 0) {
            // Scambio "gratuito": mantiene la casualità senza cambiare il costo
            seatOf[x] = sy; seatOf[y] = sx;
            if (sx >= 0) pos[sx] = y < nSeats ? y : -1;
            if (sy >= 0) pos[sy] = x < nSeats ? x : -1;
            continue;
          }
          let before = 0;
          touched.forEach((i) => (before += ruleCostAt(i, pos)));
          seatOf[x] = sy; seatOf[y] = sx;
          if (sx >= 0) pos[sx] = y < nSeats ? y : -1;
          if (sy >= 0) pos[sy] = x < nSeats ? x : -1;
          let after = 0;
          touched.forEach((i) => (after += ruleCostAt(i, pos)));
          const delta = after - before;

          if (delta <= 0 || rng() < Math.exp(-delta / T)) {
            cost += delta;
            if (cost < runBest.cost) runBest = { cost, seatOf: seatOf.slice() };
          } else {
            // annulla lo scambio
            seatOf[x] = sx; seatOf[y] = sy;
            if (sx >= 0) pos[sx] = x < nSeats ? x : -1;
            if (sy >= 0) pos[sy] = y < nSeats ? y : -1;
          }
        }
      }
      if (!best || runBest.cost < best.cost) best = runBest;
      if (best.cost === 0) break;
    }

    const seatOf = best.seatOf.slice(0, nSeats);
    const pos = new Array(nStud).fill(-1);
    seatOf.forEach((s, seat) => { if (s >= 0) pos[s] = seat; });
    const ev = evaluate(pos, layout, compiled, students);
    return { pos, seatOf, cost: ev.cost, violations: ev.violations };
  }

  const api = { REL, RULE_TYPES, W, buildLayout, parseNames, compileRules, evaluate, solve, makeRng };
  root.RdPosti = root.RdPosti || {};
  Object.assign(root.RdPosti, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
