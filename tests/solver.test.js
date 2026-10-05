// Esegui con: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { UnionFind } = require('../public/js/unionfind.js');
const { buildLayout, parseNames, solve, makeRng, REL } = require('../public/js/solver.js');

const desk = (id, c, r) => ({ id, type: 'desk', c, r, w: 1, h: 1 });

test('UnionFind unisce e trova', () => {
  const uf = new UnionFind(5);
  uf.union(0, 1);
  uf.union(3, 4);
  assert.strictEqual(uf.find(0), uf.find(1));
  assert.notStrictEqual(uf.find(1), uf.find(3));
  uf.union(1, 4);
  assert.strictEqual(uf.find(0), uf.find(3));
});

test('parseNames divide nome e cognome', () => {
  const s = parseNames('Mario Rossi,  Giulia   De Luca ;Anna\nLuca Verdi,');
  assert.deepStrictEqual(s.map((x) => x.full), ['Mario Rossi', 'Giulia De Luca', 'Anna', 'Luca Verdi']);
  assert.strictEqual(s[1].nome, 'Giulia');
  assert.strictEqual(s[1].cognome, 'De Luca');
});

test('buildLayout: gruppi, file e relazioni', () => {
  // Due banchi uniti in fila 0, due uniti in fila 1, uno isolato in fila 1
  const items = [desk('a', 0, 0), desk('b', 1, 0), desk('c', 0, 2), desk('d', 1, 2), desk('e', 5, 2)];
  const L = buildLayout(items);
  assert.strictEqual(L.groupCount, 3);
  assert.strictEqual(L.rel[0][1], REL.SIDE);
  assert.strictEqual(L.rel[0][2], REL.FRONTBACK); // corridoio di una riga in mezzo
  assert.strictEqual(L.rel[0][3], REL.DIAG);
  assert.strictEqual(L.rel[0][4], REL.NONE);
  assert.deepStrictEqual(L.rank, [0, 0, 1, 1, 1]);
});

test('cattedra in basso inverte le file', () => {
  const items = [desk('a', 0, 0), desk('b', 0, 1), { id: 't', type: 'teacher', c: 0, r: 5, w: 3, h: 1 }];
  const L = buildLayout(items);
  assert.deepStrictEqual(L.rank, [1, 0]);
});

test('solve rispetta incompatibilità e file', () => {
  // 3 colonne di coppie x 4 file
  const items = [];
  for (let r = 0; r < 4; r++) for (const c of [0, 1, 3, 4, 6, 7]) items.push(desk(`${c}-${r}`, c, r * 2));
  const layout = buildLayout(items);
  const students = parseNames(Array.from({ length: 22 }, (_, i) => `Studente ${i + 1}`).join(','));
  const rules = [
    { type: 'separa', a: 'Studente 1', b: 'Studente 2' },
    { type: 'separa', a: 'Studente 1', b: 'Studente 3' },
    { type: 'separa', a: 'Studente 2', b: 'Studente 3' },
    { type: 'vicini', a: 'Studente 4', b: 'Studente 5' },
    { type: 'prima', a: 'Studente 6' },
    { type: 'ultima', a: 'Studente 7' },
    { type: 'noPrima', a: 'Studente 8' },
  ];
  for (let seed = 1; seed <= 20; seed++) {
    const res = solve({ layout, students, rules, rng: makeRng(seed) });
    assert.strictEqual(res.cost, 0, `seed ${seed}: ${JSON.stringify(res.violations)}`);
    assert.strictEqual(res.pos.filter((p) => p >= 0).length, 22);
    assert.strictEqual(new Set(res.pos).size, 22);
  }
});

test('più studenti che posti: alcuni restano senza posto', () => {
  const layout = buildLayout([desk('a', 0, 0), desk('b', 1, 0)]);
  const students = parseNames('A A, B B, C C');
  const res = solve({ layout, students, rules: [], rng: makeRng(3) });
  assert.strictEqual(res.pos.filter((p) => p < 0).length, 1);
});
