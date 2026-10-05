/* RdPosti: interfaccia (aula, inventario, nomi, regole). */
(function () {
  'use strict';
  const { buildLayout, parseNames, compileRules, evaluate, solve, RULE_TYPES } = window.RdPosti;

  const STORAGE_KEY = 'rdposti:v1';
  const SIZES = { desk: { w: 1, h: 1 }, teacher: { w: 3, h: 1 } };
  const DRAG_THRESHOLD = 5;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /** Icona SVG dallo sprite in index.html (id senza prefisso "i-"). */
  const icon = (id, cls) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + id);
    svg.appendChild(use);
    return svg;
  };

  // ---------------------------------------------------------------- Stato
  let state = load() || defaultState();
  let selectedDesk = null; // per lo scambio manuale
  let cell = 48;
  let lastEval = null;

  function defaultState() {
    return { cols: 12, rows: 11, items: [], namesText: '', rules: [], assign: {} };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage non disponibile: pazienza */ }
  }

  function sanitize(s) {
    if (!s || !Array.isArray(s.items)) return null;
    const clampInt = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
    return {
      cols: clampInt(s.cols, 6, 24, 12),
      rows: clampInt(s.rows, 5, 16, 11),
      items: s.items
        .filter((it) => it && SIZES[it.type])
        .map((it) => ({
          id: String(it.id || uid()),
          type: it.type,
          c: clampInt(it.c, 0, 23, 0),
          r: clampInt(it.r, 0, 15, 0),
          w: clampInt(it.w, 1, 3, SIZES[it.type].w),
          h: clampInt(it.h, 1, 3, SIZES[it.type].h),
        })),
      namesText: typeof s.namesText === 'string' ? s.namesText : '',
      rules: Array.isArray(s.rules)
        ? s.rules.filter((r) => r && RULE_TYPES[r.type]).map((r) => ({ id: String(r.id || uid()), type: r.type, a: String(r.a || ''), b: String(r.b || '') }))
        : [],
      assign: s.assign && typeof s.assign === 'object' ? s.assign : {},
    };
  }

  // ---------------------------------------------------------------- Disposizioni rapide
  function preset(name, cols, rows) {
    const items = [];
    const desk = (c, r) => items.push({ id: uid(), type: 'desk', c, r, w: 1, h: 1 });
    const teacherC = Math.max(0, Math.floor((cols - 3) / 2));
    if (name !== 'clear') items.push({ id: uid(), type: 'teacher', c: teacherC, r: 0, w: 3, h: 1 });

    if (name === 'pairs') {
      const blocks = Math.min(3, Math.floor((cols + 2) / 4));
      const width = blocks * 2 + (blocks - 1) * 2;
      const start = Math.floor((cols - width) / 2);
      for (let r = 2; r < rows; r += 2)
        for (let b = 0; b < blocks; b++) {
          desk(start + b * 4, r);
          desk(start + b * 4 + 1, r);
        }
    } else if (name === 'islands') {
      const blocks = Math.floor((cols + 1) / 3);
      const width = blocks * 2 + (blocks - 1);
      const start = Math.floor((cols - width) / 2);
      for (let r = 2; r + 1 < rows; r += 3)
        for (let b = 0; b < blocks; b++) {
          const c = start + b * 3;
          desk(c, r); desk(c + 1, r); desk(c, r + 1); desk(c + 1, r + 1);
        }
    } else if (name === 'horseshoe') {
      const left = 1, right = cols - 2, top = 2, bottom = rows - 1;
      for (let r = top; r <= bottom; r++) { desk(left, r); desk(right, r); }
      for (let c = left + 1; c < right; c++) desk(c, bottom);
      // seconda "U" interna più piccola
      const l2 = left + 3, r2 = right - 3, b2 = bottom - 3;
      if (r2 - l2 >= 2 && b2 - top >= 2) {
        for (let r = top + 1; r <= b2; r++) { desk(l2, r); desk(r2, r); }
        for (let c = l2 + 1; c < r2; c++) desk(c, b2);
      }
    }
    return items;
  }

  // ---------------------------------------------------------------- Dati derivati
  /** Studenti dal testo, con nomi doppi resi unici. */
  function getStudents() {
    const seen = new Map();
    const dups = [];
    const list = parseNames(state.namesText).map((s) => {
      const key = s.full.toLowerCase();
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) {
        dups.push(s.full);
        return { ...s, full: `${s.full} (${n})`, cognome: `${s.cognome} (${n})`, dup: true };
      }
      return s;
    });
    return { list, dups };
  }

  function derive() {
    const layout = buildLayout(state.items);
    const { list: students, dups } = getStudents();
    // numerazione dei posti: dalla prima fila, da sinistra a destra
    const order = layout.seats.map((s, i) => i).sort((a, b) => layout.seats[a].rank - layout.seats[b].rank || layout.seats[a].c - layout.seats[b].c);
    const seatNumber = new Map(order.map((seatIdx, k) => [layout.seats[seatIdx].id, k + 1]));
    const seatIndexById = new Map(layout.seats.map((s, i) => [s.id, i]));

    const nameIdx = new Map(students.map((s, i) => [s.full, i]));
    const pos = new Array(students.length).fill(-1);
    for (const [deskId, name] of Object.entries(state.assign)) {
      const si = nameIdx.get(name);
      const seat = seatIndexById.get(deskId);
      if (si !== undefined && seat !== undefined) pos[si] = seat;
    }
    const compiled = compileRules(state.rules, students);
    const hasAssign = pos.some((p) => p >= 0);
    const ev = hasAssign ? evaluate(pos, layout, compiled, students) : null;
    return { layout, students, dups, seatNumber, pos, compiled, ev };
  }

  // ---------------------------------------------------------------- Rendering
  const roomEl = $('#room');
  const gridEl = $('#roomGrid');

  function computeCell() {
    const style = getComputedStyle(roomEl);
    const avail = roomEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    cell = Math.max(30, Math.min(78, Math.floor(avail / state.cols)));
    gridEl.style.setProperty('--cell', cell + 'px');
    gridEl.style.width = state.cols * cell + 'px';
    gridEl.style.height = state.rows * cell + 'px';
  }

  function render() {
    const d = derive();
    lastEval = d;
    renderRoom(d);
    renderStats(d);
    renderNames(d);
    renderRules(d);
    renderViolations(d);
    save();
  }

  function itemBox(it, join) {
    const g = 4;
    const jl = join && join.l, jr = join && join.r, jt = join && join.t, jb = join && join.b;
    return {
      left: it.c * cell + (jl ? 0 : g),
      top: it.r * cell + (jt ? 0 : g),
      width: it.w * cell - (jl ? 0 : g) - (jr ? 0 : g),
      height: it.h * cell - (jt ? 0 : g) - (jb ? 0 : g),
    };
  }

  function renderRoom(d) {
    computeCell();
    gridEl.textContent = '';
    const badStudents = new Set();
    if (d.ev) d.ev.violations.forEach((v) => v.students.forEach((s) => badStudents.add(s)));
    const studentAt = new Map();
    d.pos.forEach((seat, si) => { if (seat >= 0) studentAt.set(d.layout.seats[seat].id, si); });
    const seatById = new Map(d.layout.seats.map((s) => [s.id, s]));

    for (const it of state.items) {
      const node = el('div', 'item ' + it.type);
      node.dataset.id = it.id;
      if (it.type === 'teacher') {
        node.textContent = it.w >= it.h ? 'Cattedra' : 'Catt.';
        node.title = 'Cattedra: trascina per spostare, clic destro per ruotare';
        Object.assign(node.style, px(itemBox(it)));
      } else {
        const seat = seatById.get(it.id);
        const j = seat.join;
        Object.assign(node.style, px(itemBox(it, j)));
        const radius = 10;
        node.style.borderRadius = [
          !j.l && !j.t ? radius : 0, !j.r && !j.t ? radius : 0,
          !j.r && !j.b ? radius : 0, !j.l && !j.b ? radius : 0,
        ].map((v) => v + 'px').join(' ');
        if (j.l) node.classList.add('jl');
        if (j.t) node.classList.add('jt');
        if (j.r) node.style.borderRightWidth = '0';
        if (j.b) node.style.borderBottomWidth = '0';
        node.appendChild(el('span', 'num', d.seatNumber.get(it.id)));
        const si = studentAt.get(it.id);
        if (si !== undefined) {
          const st = d.students[si];
          node.classList.add('filled');
          if (badStudents.has(si)) node.classList.add('bad');
          node.appendChild(el('span', 'nm', st.nome));
          if (st.cognome && cell >= 44) node.appendChild(el('span', 'sn', st.cognome));
          node.title = `Posto ${d.seatNumber.get(it.id)}: ${st.full} (fila ${seat.rank + 1})`;
        } else {
          node.title = `Posto ${d.seatNumber.get(it.id)} (fila ${seat.rank + 1})`;
        }
        if (selectedDesk === it.id) node.classList.add('selected');
      }
      gridEl.appendChild(node);
    }
  }

  const px = (b) => ({ left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });

  function renderStats(d) {
    const n = d.layout.seats.length;
    $('#stats').textContent = n
      ? `${n} banchi · ${d.layout.groupCount} gruppi · ${d.layout.maxRank + 1} file`
      : 'Nessun banco';
    $('#roomEmpty').hidden = state.items.length > 0;
  }

  function renderNames(d) {
    const body = $('#namesBody');
    body.textContent = '';
    if (!d.students.length) {
      const tr = el('tr', 'empty');
      const td = el('td', null, 'Nessuno studente ancora');
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
    }
    d.students.forEach((s, i) => {
      const tr = el('tr', s.dup ? 'dup' : '');
      const seat = d.pos[i];
      if (seat < 0 && Object.keys(state.assign).length) tr.classList.add('noseat');
      tr.appendChild(el('td', null, i + 1));
      tr.appendChild(el('td', null, s.nome));
      tr.appendChild(el('td', null, s.cognome));
      tr.appendChild(el('td', null, seat >= 0 ? d.seatNumber.get(d.layout.seats[seat].id) : '—'));
      body.appendChild(tr);
    });

    const count = $('#count');
    const nS = d.students.length, nB = d.layout.seats.length;
    count.textContent = '';
    count.appendChild(document.createTextNode(`${nS} studenti · ${nB} banchi · `));
    let msg, cls;
    if (!nS) { msg = 'scrivi i nomi'; cls = ''; }
    else if (nS > nB) { msg = `mancano ${nS - nB} banchi`; cls = 'warn'; }
    else if (nS < nB) { msg = `${nB - nS} banchi liberi`; cls = 'okc'; }
    else { msg = 'perfetto!'; cls = 'okc'; }
    count.appendChild(el('span', cls, msg));
    if (d.dups.length) count.appendChild(el('div', 'warn', `Nomi ripetuti: ${[...new Set(d.dups)].join(', ')}`));
  }

  function fillSelect(select, options, keep) {
    const prev = keep ? select.value : null;
    select.textContent = '';
    for (const [value, label] of options) {
      const o = el('option', null, label);
      o.value = value;
      select.appendChild(o);
    }
    if (prev && options.some(([v]) => v === prev)) select.value = prev;
  }

  function renderRules(d) {
    const studentOpts = d.students.map((s) => [s.full, s.full]);
    const placeholder = [['', d.students.length ? 'Scegli studente…' : 'Prima scrivi i nomi']];
    fillSelect($('#ruleA'), placeholder.concat(studentOpts), true);
    fillSelect($('#ruleB'), placeholder.concat(studentOpts), true);
    updateRuleBState();

    const activeSet = new Set(d.compiled.map((c) => c.src));
    const brokenSet = new Set(d.ev ? d.ev.violations.map((v) => v.rule) : []);
    const list = $('#ruleList');
    list.textContent = '';
    if (!state.rules.length) list.appendChild(el('li', 'empty-note', 'Nessuna regola. Aggiungine una qui sopra.'));
    for (const r of state.rules) {
      const t = RULE_TYPES[r.type];
      const li = el('li');
      if (!activeSet.has(r)) {
        li.classList.add('inactive');
        li.title = 'Uno degli studenti non è più nella lista: regola ignorata';
      } else if (brokenSet.has(r)) li.classList.add('broken');
      li.appendChild(icon(t.icon));
      const txt = el('span');
      txt.appendChild(document.createTextNode(t.pair ? `${r.a} e ${r.b} ` : `${r.a} `));
      txt.appendChild(el('span', 'muted', t.label.toLowerCase()));
      li.appendChild(txt);
      const del = el('button', 'icon-btn del');
      del.appendChild(icon('x', 'sm'));
      del.title = 'Elimina regola';
      del.setAttribute('aria-label', 'Elimina regola');
      del.addEventListener('click', () => {
        state.rules = state.rules.filter((x) => x !== r);
        render();
      });
      li.appendChild(del);
      list.appendChild(li);
    }

    $('#rulesBadge').textContent = d.compiled.length;
    const status = $('#rulesStatus');
    status.textContent = '';
    status.className = 'status';
    if (d.ev && !d.ev.violations.length) {
      status.classList.add('ok');
      status.append(icon('check', 'sm'), 'tutte rispettate');
    } else if (d.ev) {
      status.classList.add('bad');
      status.append(icon('alert', 'sm'), `${d.ev.violations.length} non rispettate`);
    }
  }

  function renderViolations(d) {
    const ul = $('#violations');
    ul.textContent = '';
    if (!d.ev) {
      ul.appendChild(el('li', 'empty-note', 'Genera una disposizione per vedere il risultato.'));
      return;
    }
    if (!d.ev.violations.length) {
      const li = el('li', 'ok');
      li.append(icon('check'), d.compiled.length ? 'Tutte le regole sono rispettate' : 'Disposizione casuale, nessuna regola attiva');
      ul.appendChild(li);
      return;
    }
    for (const v of d.ev.violations) {
      const li = el('li', v.severe ? 'severe' : 'warn');
      li.append(icon('alert'), v.text);
      ul.appendChild(li);
    }
  }

  // ---------------------------------------------------------------- Griglia
  function canPlace(w, h, c, r, ignoreId) {
    if (c < 0 || r < 0 || c + w > state.cols || r + h > state.rows) return false;
    return !state.items.some((it) => it.id !== ignoreId && c < it.c + it.w && it.c < c + w && r < it.r + it.h && it.r < r + h);
  }

  function removeItem(id) {
    state.items = state.items.filter((it) => it.id !== id);
    delete state.assign[id];
    if (selectedDesk === id) selectedDesk = null;
  }

  // ---------------------------------------------------------------- Drag & drop (pointer events)
  let drag = null;

  function beginPointer(e, info) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { ...info, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function activateDrag(e) {
    drag.active = true;
    const w = drag.w * cell, h = drag.h * cell;
    const ghost = el('div', 'item drag-ghost ' + drag.type);
    if (drag.type === 'desk') ghost.classList.add('desk');
    else ghost.textContent = 'Cattedra';
    Object.assign(ghost.style, { width: w - 8 + 'px', height: h - 8 + 'px' });
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    if (drag.srcEl) {
      // mantieni il punto di presa sull'oggetto
      const rect = drag.srcEl.getBoundingClientRect();
      drag.offX = drag.startX - rect.left;
      drag.offY = drag.startY - rect.top;
      drag.srcEl.classList.add('dragging-src');
    } else {
      drag.offX = (w - 8) / 2;
      drag.offY = (h - 8) / 2;
    }
    drag.preview = el('div', 'drop-preview');
    gridEl.appendChild(drag.preview);
  }

  function dropTarget(e) {
    const roomRect = roomEl.getBoundingClientRect();
    const inside = e.clientX >= roomRect.left && e.clientX <= roomRect.right && e.clientY >= roomRect.top && e.clientY <= roomRect.bottom;
    const g = gridEl.getBoundingClientRect();
    const x = e.clientX - drag.offX - g.left;
    const y = e.clientY - drag.offY - g.top;
    const c = Math.round(x / cell);
    const r = Math.round(y / cell);
    return { inside, c, r, valid: inside && canPlace(drag.w, drag.h, c, r, drag.id) };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      activateDrag(e);
    }
    drag.ghost.style.left = e.clientX - drag.offX + 'px';
    drag.ghost.style.top = e.clientY - drag.offY + 'px';
    const t = dropTarget(e);
    const p = drag.preview;
    if (t.inside) {
      p.style.display = '';
      const cc = Math.max(0, Math.min(state.cols - drag.w, t.c));
      const rr = Math.max(0, Math.min(state.rows - drag.h, t.r));
      Object.assign(p.style, px(itemBox({ c: cc, r: rr, w: drag.w, h: drag.h })));
      p.classList.toggle('invalid', !t.valid);
    } else {
      p.style.display = 'none';
    }
    drag.ghost.style.opacity = !t.inside && drag.kind === 'move' ? '.4' : '.85';
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    if (!d.active) {
      cleanupDrag();
      if (d.kind === 'move' && d.type === 'desk') onDeskClick(d.id);
      return;
    }
    const t = dropTarget(e);
    cleanupDrag();
    if (d.kind === 'new') {
      if (t.valid) state.items.push({ id: uid(), type: d.type, c: t.c, r: t.r, w: d.w, h: d.h });
      else if (t.inside) toast('Lì non c’è spazio');
    } else {
      const it = state.items.find((x) => x.id === d.id);
      if (!t.inside) {
        removeItem(d.id);
        toast(d.type === 'desk' ? 'Banco rimosso' : 'Cattedra rimossa');
      } else if (t.valid && it) {
        it.c = t.c;
        it.r = t.r;
      }
    }
    render();
  }

  function cleanupDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    if (drag.preview) drag.preview.remove();
    if (drag.srcEl) drag.srcEl.classList.remove('dragging-src');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancelDrag);
    drag = null;
  }

  function cancelDrag() {
    cleanupDrag();
  }

  // Inventario
  document.querySelectorAll('.inv-item').forEach((node) => {
    node.addEventListener('pointerdown', (e) => {
      const type = node.dataset.type;
      beginPointer(e, { kind: 'new', type, id: null, ...SIZES[type] });
    });
  });

  // Oggetti nell'aula
  gridEl.addEventListener('pointerdown', (e) => {
    const node = e.target.closest('.item');
    if (!node || node.classList.contains('drag-ghost')) return;
    const it = state.items.find((x) => x.id === node.dataset.id);
    if (!it) return;
    beginPointer(e, { kind: 'move', type: it.type, id: it.id, w: it.w, h: it.h, srcEl: node });
  });

  gridEl.addEventListener('dblclick', (e) => {
    const node = e.target.closest('.item');
    if (node) {
      removeItem(node.dataset.id);
      selectedDesk = null;
      render();
      return;
    }
    const g = gridEl.getBoundingClientRect();
    const c = Math.floor((e.clientX - g.left) / cell);
    const r = Math.floor((e.clientY - g.top) / cell);
    if (canPlace(1, 1, c, r, null)) {
      state.items.push({ id: uid(), type: 'desk', c, r, w: 1, h: 1 });
      render();
    }
  });

  gridEl.addEventListener('contextmenu', (e) => {
    const node = e.target.closest('.item.teacher');
    if (!node) return;
    e.preventDefault();
    const it = state.items.find((x) => x.id === node.dataset.id);
    if (it && canPlace(it.h, it.w, it.c, it.r, it.id)) {
      [it.w, it.h] = [it.h, it.w];
      render();
    } else toast('Non c’è spazio per ruotare la cattedra');
  });

  // Scambio manuale: clic su due banchi
  function onDeskClick(id) {
    if (!Object.keys(state.assign).length) return;
    if (!selectedDesk) {
      selectedDesk = id;
    } else if (selectedDesk === id) {
      selectedDesk = null;
    } else {
      const a = state.assign[selectedDesk], b = state.assign[id];
      delete state.assign[selectedDesk];
      delete state.assign[id];
      if (a) state.assign[id] = a;
      if (b) state.assign[selectedDesk] = b;
      selectedDesk = null;
      toast('Posti scambiati');
    }
    render();
  }

  // ---------------------------------------------------------------- Nomi e generazione
  const namesInput = $('#namesInput');
  namesInput.value = state.namesText;
  let namesTimer = null;
  namesInput.addEventListener('input', () => {
    clearTimeout(namesTimer);
    namesTimer = setTimeout(() => {
      state.namesText = namesInput.value;
      render();
    }, 200);
  });

  $('#btnGenerate').addEventListener('click', () => {
    state.namesText = namesInput.value;
    const layout = buildLayout(state.items);
    const { list: students } = getStudents();
    if (!layout.seats.length) return toast('Aggiungi prima qualche banco');
    if (!students.length) return toast('Scrivi prima i nomi degli studenti');

    const res = solve({ layout, students, rules: state.rules });
    state.assign = {};
    res.seatOf.forEach((si, seat) => {
      if (si >= 0) state.assign[layout.seats[seat].id] = students[si].full;
    });
    selectedDesk = null;
    render();
    const missing = students.length - layout.seats.length;
    if (missing > 0) toast(`Attenzione: ${missing} studenti senza banco`);
    else if (!res.violations.length) toast(state.rules.length ? 'Fatto, tutte le regole rispettate' : 'Disposizione generata');
    else toast(`Fatto, ma ${res.violations.length} regole non si possono rispettare con questa aula`);
  });

  $('#btnClearSeats').addEventListener('click', () => {
    state.assign = {};
    selectedDesk = null;
    render();
  });

  // ---------------------------------------------------------------- Regole
  let ruleType = 'separa';
  const picker = $('#typePicker');
  for (const [key, t] of Object.entries(RULE_TYPES)) {
    const b = el('button', 'type-opt');
    b.type = 'button';
    b.dataset.type = key;
    b.setAttribute('role', 'radio');
    b.title = t.label;
    b.append(icon(t.icon, 'sm'), t.short);
    b.addEventListener('click', () => {
      ruleType = key;
      updateRuleBState();
    });
    picker.appendChild(b);
  }
  function updateRuleBState() {
    const pair = RULE_TYPES[ruleType].pair;
    picker.querySelectorAll('.type-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === ruleType)));
    $('#ruleB').disabled = !pair;
    $('#ruleB').style.display = pair ? '' : 'none';
    $('#ruleJoin').style.display = pair ? '' : 'none';
  }

  $('#ruleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = ruleType;
    const pair = RULE_TYPES[type].pair;
    const a = $('#ruleA').value;
    const b = pair ? $('#ruleB').value : '';
    if (!a || (pair && !b)) return toast('Scegli gli studenti');
    if (pair && a === b) return toast('Scegli due studenti diversi');
    const same = (r) => r.type === type && ((r.a === a && r.b === b) || (pair && r.a === b && r.b === a));
    if (state.rules.some(same)) return toast('Questa regola esiste già');
    const conflict = state.rules.find((r) => pair && r.type !== type && RULE_TYPES[r.type].pair && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
    if (conflict) return toast('C’è già una regola opposta per questa coppia');
    state.rules.push({ id: uid(), type, a, b });
    render();
  });

  const toggle = $('#rulesToggle');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    $('#rulesPanel').hidden = open;
    if (!open) $('#rules').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ---------------------------------------------------------------- Inventario: preset e dimensioni
  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      const name = b.dataset.preset;
      if (state.items.length && !confirm('Sostituire la disposizione attuale dell’aula?')) return;
      state.items = preset(name, state.cols, state.rows);
      state.assign = {};
      selectedDesk = null;
      render();
    })
  );

  const inCols = $('#inCols'), inRows = $('#inRows');
  inCols.value = state.cols;
  inRows.value = state.rows;
  function onDims() {
    const cols = Math.min(24, Math.max(6, parseInt(inCols.value, 10) || state.cols));
    const rows = Math.min(16, Math.max(5, parseInt(inRows.value, 10) || state.rows));
    const out = state.items.filter((it) => it.c + it.w > cols || it.r + it.h > rows);
    if (out.length && !confirm(`${out.length} oggetti finiscono fuori dall’aula e verranno rimossi. Continuare?`)) {
      inCols.value = state.cols;
      inRows.value = state.rows;
      return;
    }
    out.forEach((it) => removeItem(it.id));
    state.cols = cols;
    state.rows = rows;
    inCols.value = cols;
    inRows.value = rows;
    render();
  }
  inCols.addEventListener('change', onDims);
  inRows.addEventListener('change', onDims);

  // ---------------------------------------------------------------- Esporta / importa / stampa
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'RdPosti', version: 1, ...state }, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rdposti-classe.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#fileImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = sanitize(JSON.parse(await file.text()));
      if (!data) throw new Error('formato');
      state = data;
      namesInput.value = state.namesText;
      inCols.value = state.cols;
      inRows.value = state.rows;
      selectedDesk = null;
      render();
      toast('Classe importata');
    } catch (err) {
      toast('File non valido');
    }
  });

  $('#btnPrint').addEventListener('click', () => window.print());

  // ---------------------------------------------------------------- Varie
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelDrag();
      if (selectedDesk) { selectedDesk = null; render(); }
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => lastEval && renderRoom(lastEval), 100);
  });

  render();
})();
