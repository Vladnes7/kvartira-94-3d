import { CONTROLS, ROOMS_UI, applyOption, TEX } from './materials.js';
import { ROOMS, UI_ROOM } from './plan.js';
import { WALLS } from './plan-data.js';
import { VIEWS, HOME } from './controls.js';
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const KEY = 'kv94-finish-v1';
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

export function initUI({ player, lighting, camera, onModeChange, onCut, cutH, FULL }) {
  // restore saved finishes
  for (const c of CONTROLS) if (state[c.id] !== undefined && c.options[state[c.id]]) applyOption(c, state[c.id]);

  let panelRoom = 'living';
  const roomsEl = $('#rooms'), ctrlsEl = $('#ctrls');
  for (const r of ROOMS_UI) {
    const b = document.createElement('button'); b.textContent = r.name; b.dataset.r = r.id;
    b.onclick = () => { panelRoom = r.id; renderPanel(); };
    roomsEl.appendChild(b);
  }
  const thumb = (o) => {
    if (!o.map) return `background:${o.color}`;
    try {
      const t = typeof o.map === 'function' ? o.map() : o.map;
      const img = t && t.image;
      if (img && img.toDataURL) { if (!img._thumb) { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').drawImage(img, 0, 0, img.width / 3, img.height / 3, 0, 0, 64, 64); img._thumb = c.toDataURL('image/jpeg', 0.8); } return `background-image:url(${img._thumb})`; }
    } catch (e) { /* ignore */ }
    return `background:${o.color}`;
  };
  function renderPanel() {
    for (const b of roomsEl.children) b.classList.toggle('on', b.dataset.r === panelRoom);
    ctrlsEl.innerHTML = '';
    const list = CONTROLS.filter((c) => c.room === panelRoom);
    const global = CONTROLS.filter((c) => c.room === '*');
    const addSec = (t) => { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; ctrlsEl.appendChild(d); };
    const addCtrl = (c) => {
      const wrap = document.createElement('div'); wrap.className = 'ctrl';
      const cur = state[c.id] ?? 0;
      wrap.innerHTML = `<div class="lbl">${c.label}</div><div class="val">${c.options[cur].name}</div>`;
      const sw = document.createElement('div'); sw.className = 'sw';
      c.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.setAttribute('style', thumb(o)); b.title = o.name; b.setAttribute('aria-label', o.name);
        if (i === cur) b.classList.add('on');
        b.onclick = () => { state[c.id] = i; save(); applyOption(c, i); wrap.querySelector('.val').textContent = o.name; for (const x of sw.children) x.classList.remove('on'); b.classList.add('on'); };
        sw.appendChild(b);
      });
      wrap.appendChild(sw); ctrlsEl.appendChild(wrap);
    };
    addSec(ROOMS_UI.find((r) => r.id === panelRoom).name);
    list.forEach(addCtrl);
    addSec('Для всей квартиры');
    global.forEach(addCtrl);
  }
  renderPanel();

  const panel = $('#panel');
  const openPanel = (v) => { panel.classList.toggle('open', v); if (v && document.pointerLockElement) document.exitPointerLock(); };
  $('#openPanel').onclick = () => { panelRoom = currentUIRoom || panelRoom; renderPanel(); openPanel(!panel.classList.contains('open')); };
  $('#closePanel').onclick = () => openPanel(false);
  $('#resetBtn').onclick = () => { for (const c of CONTROLS) { applyOption(c, 0); } state = {}; save(); renderPanel(); toast('Отделка как в проекте'); };

  // mode & time
  const modeSeg = $('#modeSeg'), timeSeg = $('#timeSeg');
  for (const b of modeSeg.children) b.onclick = () => { player.setMode(b.dataset.m); };
  player.onMode = (m) => { for (const b of modeSeg.children) b.classList.toggle('on', b.dataset.m === m); document.body.classList.toggle('walk', m === 'walk'); onModeChange(m); };
  document.body.classList.add('walk');
  for (const b of timeSeg.children) b.onclick = () => { for (const x of timeSeg.children) x.classList.toggle('on', x === b); lighting.setMode(b.dataset.t); };

  // help / start overlay
  const start = $('#start');
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) { $('#keysDesk').classList.add('hidden'); $('#keysTouch').classList.remove('hidden'); }
  $('#helpBtn').onclick = () => { start.classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); };
  $('#enterBtn').onclick = () => { start.classList.add('hidden'); player.setMode('walk'); if (!touch) player.lock(); else if (canFS && !isFS()) toggleFS(); lookHint.style.opacity = '1'; };
  $('#overviewBtn').onclick = () => { start.classList.add('hidden'); player.setMode('orbit'); focusRoom(null, 'iso'); };
  $('#gl').addEventListener('click', () => { if (player.mode === 'walk' && !player.locked && !touch && start.classList.contains('hidden') && !panel.classList.contains('open')) player.lock(); });

  const qSeg = $('#qSeg');
  let q0 = 'high'; try { q0 = localStorage.getItem('kv94-quality') || 'high'; } catch (e) { /* */ }
  for (const b of qSeg.children) { b.classList.toggle('on', b.dataset.q === q0); b.onclick = () => { for (const x of qSeg.children) x.classList.toggle('on', x === b); window.__setQuality && window.__setQuality(b.dataset.q); }; }
  const cross = $('#cross');
  player.onLock = (l) => { cross.style.display = l ? 'block' : 'none'; };
  player.onHot = (h) => { cross.classList.toggle('hot', h); $('#gl').style.cursor = h && !player.locked ? 'pointer' : ''; };

  // touch / small-screen layout, persistent joystick, run button
  const body = document.body;
  const setLayout = () => { body.classList.toggle('touch', touch); body.classList.toggle('small', innerWidth < 720 || innerHeight < 460); };
  setLayout(); addEventListener('resize', setLayout);
  const joy = $('#joy'), knob = joy.firstElementChild;
  player.joyBase = () => { const r = joy.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  player.onJoy = (j) => { joy.classList.toggle('active', !!j.active); knob.style.transform = j.active ? `translate(${(j.kx || 0) * 40}px, ${(j.ky || 0) * 40}px)` : ''; if (j.active) hideLookHint(); };
  const lookHint = $('#lookHint'); let hintT;
  const hideLookHint = () => { clearTimeout(hintT); hintT = setTimeout(() => { lookHint.style.opacity = '0'; }, 2500); };

  // fullscreen (laptop: button or F; Android: button; iPhone: home-screen hint)
  const fsEl = document.documentElement;
  const canFS = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  const toggleFS = () => {
    if (!canFS) { toast(standalone ? 'Уже во весь экран' : 'На iPhone: «Поделиться» → «На экран Домой», затем откройте с иконки'); return; }
    try {
      if (isFS()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => toast('Браузер не разрешил полный экран')); try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* */ } }
    } catch (e) { toast('Браузер не разрешил полный экран'); }
  };
  $('#fsBtn').onclick = (e) => { e.stopPropagation(); toggleFS(); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) toggleFS(); });
  window.__toggleFS = toggleFS;

  // ---- minimap ----
  const mc = $('#mapc'), ctx = mc.getContext('2d');
  const X0 = -400, Y0 = -400, SX = 12000, SY = 10200;
  const sc = Math.min(mc.width / SX, mc.height / SY);
  const ox = (mc.width - SX * sc) / 2, oy = (mc.height - SY * sc) / 2;
  const toC = (x, y) => [ox + (x - X0) * sc, oy + (y - Y0) * sc];
  const base = document.createElement('canvas'); base.width = mc.width; base.height = mc.height;
  {
    const b = base.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#2a2622';
    for (const r of ROOMS) {
      b.beginPath(); r.poly.forEach(([x, y], i) => { const [cx, cy] = toC(x, y); i ? b.lineTo(cx, cy) : b.moveTo(cx, cy); }); b.closePath();
      b.fillStyle = { floor_wood: 'rgba(180,155,132,.35)', floor_hall: 'rgba(230,225,215,.5)', floor_bath: 'rgba(200,200,200,.45)', floor_wc: 'rgba(230,225,215,.5)' }[r.floor]; b.fill();
    }
    b.fillStyle = ink;
    for (const p of WALLS) { b.beginPath(); p.forEach(([x, y], i) => { const [cx, cy] = toC(x, y); i ? b.lineTo(cx, cy) : b.moveTo(cx, cy); }); b.closePath(); b.fill(); }
  }
  mc.addEventListener('click', (e) => {
    const rect = mc.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * mc.width, py = (e.clientY - rect.top) / rect.height * mc.height;
    const x = (px - ox) / sc + X0, y = (py - oy) / sc + Y0;
    goToPoint(x / 1000, y / 1000);
  });
  function goToPoint(x, z) {
    const r = ROOMS.find((q) => pointIn(x * 1000, z * 1000, q.poly));
    if (!r) return;
    if (!player.teleportTo(x, z)) {
      const v = { girls: 'girls', boy: 'boy', bed: 'bed', wardrobe: 'wardrobe', bath: 'bath', wc: 'wc', shower: 'wc', hall: 'hall', vest: 'hall', living: 'living' }[r.id];
      player.teleport(v);
    }
    toast(r.name);
  }

  // ---- overview: room buttons, labels on the model, view switch, wall cut height ----
  // clicking a room flies the camera to a plan view of that room; «Войти» walks into it
  const fmt = (v) => v.toFixed(2).replace('.', ',');
  const roomBar = $('#roomBar'), tip = $('#roomTip'), labelsEl = $('#labels'), goBtn = $('#roomGo');
  const total = ROOM_INFO.reduce((sum, r) => sum + r.m2, 0);
  let focus = null; // ROOM_INFO entry or null = whole apartment
  const barBtns = [];
  const hideTip = () => tip.classList.remove('show');
  const mkBar = (r) => {
    const b = document.createElement('button');
    const m2txt = fmt(r ? r.m2 : total) + ' м²';
    b.innerHTML = `<span>${r ? r.name : 'Вся квартира'}</span><small>${m2txt}</small>`;
    b.setAttribute('aria-label', r ? `${r.name}, ${m2txt}. Вид сверху. ${r.desc}` : `Вся квартира, ${m2txt}`);
    if (r) {
      const show = () => {
        tip.innerHTML = `<b>${r.name}</b><span class="m2">${m2txt}</span><p>${r.desc}</p><p class="opens">${r.opens}</p><i>Нажмите — вид сверху на комнату</i>`;
        const br = b.getBoundingClientRect(), tw = Math.min(280, innerWidth - 24);
        tip.style.width = tw + 'px';
        tip.style.left = Math.max(12, Math.min(innerWidth - tw - 12, br.left + br.width / 2 - tw / 2)) + 'px';
        tip.style.bottom = (innerHeight - br.top + 10) + 'px';
        tip.classList.add('show');
      };
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
      b.addEventListener('mouseleave', hideTip); b.addEventListener('blur', hideTip);
    }
    b.onclick = () => { hideTip(); focusRoom(r, r ? 'top' : player.view); };
    b._r = r; barBtns.push(b); roomBar.appendChild(b);
  };
  mkBar(null); for (const r of ROOM_INFO) mkBar(r);

  const viewSeg = $('#viewSeg'), cutIn = $('#cutH'), cutVal = $('#cutVal'), lblBtn = $('#lblBtn');
  function syncOverview() {
    for (const b of barBtns) b.classList.toggle('on', b._r === focus);
    for (const b of viewSeg.children) b.classList.toggle('on', b.dataset.v === player.view);
    goBtn.classList.toggle('hidden', !focus);
    if (focus) goBtn.innerHTML = `Войти: ${focus.name} <span aria-hidden="true">→</span>`;
    for (const l of labels) l.el.classList.toggle('cur', l.r === focus);
  }
  function focusRoom(r, view) {
    player.flyTo(r ? r.box : HOME, view); // may switch to overview first (which resets the focus)
    focus = r;
    syncOverview();
  }
  for (const b of viewSeg.children) b.onclick = () => focusRoom(focus, b.dataset.v);
  goBtn.onclick = () => { if (focus) { player.teleport(focus.view); toast(focus.name); } };
  let cut = cutH;
  const showCut = () => { cutVal.textContent = cut >= FULL - 0.01 ? 'полные' : cut.toFixed(2).replace(/0$/, '').replace('.', ',') + ' м'; };
  cutIn.value = String(cut); showCut();
  cutIn.addEventListener('input', () => { cut = +cutIn.value; showCut(); onCut(cut); });
  let lblOn = true;
  lblBtn.onclick = () => { lblOn = !lblOn; lblBtn.setAttribute('aria-pressed', String(lblOn)); labelsEl.classList.toggle('hidden', !lblOn); };

  // labels pinned to a free spot of each room's floor
  const labels = ROOM_INFO.map((r) => {
    const el = document.createElement('button'); el.className = 'rlabel';
    el.innerHTML = `<b>${r.name}</b><small>${fmt(r.m2)} м²</small>`;
    el.setAttribute('aria-label', `${r.name}: вид сверху`);
    el.onclick = () => focusRoom(r, 'top');
    labelsEl.appendChild(el);
    return { r, el, p: new THREE.Vector3(r.label[0], 0.05, r.label[1]) };
  });
  const v3 = new THREE.Vector3();
  function placeLabels() {
    for (const l of labels) {
      v3.copy(l.p).project(camera);
      const x = (v3.x * 0.5 + 0.5) * innerWidth, y = (-v3.y * 0.5 + 0.5) * innerHeight;
      const off = v3.z > 1 || x < -40 || x > innerWidth + 40 || y < -20 || y > innerHeight + 20;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      l.el.style.visibility = off ? 'hidden' : '';
    }
  }
  const prevMode = player.onMode;
  player.onMode = (m) => { prevMode(m); if (m === 'orbit') { focus = null; syncOverview(); } };
  player.view = 'iso'; syncOverview();

  let currentUIRoom = 'living', lastRoom = '';
  function update() {
    if (player.mode === 'orbit' && lblOn) placeLabels();
    ctx.clearRect(0, 0, mc.width, mc.height);
    ctx.drawImage(base, 0, 0);
    const p = player.mode === 'walk' ? player.pos : null;
    if (p) {
      const [cx, cy] = toC(p.x * 1000, p.z * 1000);
      const a = player.yaw;
      const fx = -Math.sin(a), fz = -Math.cos(a);
      ctx.fillStyle = 'rgba(158,75,53,.25)';
      ctx.beginPath(); ctx.moveTo(cx, cy);
      const ang = Math.atan2(fz, fx);
      ctx.arc(cx, cy, 34, ang - 0.55, ang + 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9e4b35'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      const r = ROOMS.find((q) => pointIn(p.x * 1000, p.z * 1000, q.poly));
      if (r && r.name !== lastRoom) { lastRoom = r.name; $('#roomName').textContent = r.name; $('#mapRoom').textContent = r.name; }
      if (r) currentUIRoom = UI_ROOM[r.id];
    } else if (lastRoom !== 'Обзор') { lastRoom = 'Обзор'; $('#roomName').textContent = 'Обзор'; $('#mapRoom').textContent = 'Обзор'; }
  }
  return { update, toast, showStart: () => start.classList.remove('hidden') };
}

const ROOM_INFO = [
  { view: 'living', box: [3.0, 0, 11.25, 5.53], label: [8.55, 2.75], m2: 33.23, ids: ['living'], name: 'Кухня-гостиная', desc: 'Стены под рогожку, карниз с сухариками, люстры с льняными абажурами, синие кресла, кофейный стол из брекчии.', opens: 'Открываются: кухонные шкафы и ящики, холодильник, витрины.' },
  { view: 'girls', box: [0, 0, 2.94, 5.53], label: [1.45, 3.95], m2: 16.26, ids: ['girls'], name: 'Комната девочек', desc: 'Голубые обои-шинуазри в рамках молдингов, хрустальная люстра, туалетный столик с зеркалом.', opens: 'Открываются: шкаф с арками, ящик столика.' },
  { view: 'boy', box: [3.01, 0, 5.65, 4.06], label: [4.1, 1.25], m2: 10.03, ids: ['boy'], name: 'Комната мальчика', desc: 'Арочная ниша из тёмного дуба вокруг стола, кушетка, подсвеченные полки.', opens: 'Открывается: шкаф с одеждой.' },
  { view: 'bed', box: [0, 5.6, 4.0, 8.49], label: [1.55, 5.95], m2: 11.56, ids: ['bed'], name: 'Спальня', desc: 'Оливковое изголовье со стёжкой, розовая ярусная люстра, рогожка в молдингах.', opens: '' },
  { view: 'wardrobe', box: [4.07, 5.6, 5.5, 8.49], label: [4.6, 6.9], m2: 3.41, ids: ['wardrobe'], name: 'Гардеробная', desc: 'Открытое хранение, полки с подсветкой, ростовое зеркало.', opens: 'Открываются: ящики с одеждой.' },
  { view: 'bath', box: [5.4, 5.6, 7.78, 8.49], label: [6.45, 6.35], m2: 5.91, ids: ['bath'], name: 'Ванная', desc: 'Слэб «виола», бордовая панель ванны, фреска, зеллидж в нише.', opens: 'Открываются: ниша со стиралкой, шкафчик над унитазом, ящик тумбы.' },
  { view: 'wc', box: [9.28, 4.74, 11.25, 7.44], label: [10.25, 5.25], m2: 4.63, ids: ['wc', 'shower'], name: 'Санузел с душем', desc: 'Оникс, бронзовые арочные двери душа, тумба из ореха.', opens: 'Открываются: навесной шкаф, ящики тумбы.' },
  { view: 'hall', box: [7.18, 5.6, 9.96, 9.42], label: [8.6, 8.3], m2: 7.41, ids: ['hall', 'vest'], name: 'Прихожая', desc: 'Терракотовые стены, плитка-чешуя, арочное зеркало с подсветкой.', opens: 'Открываются: шкафы с верхней одеждой, антресоль.' },
];

function pointIn(x, y, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
  return ins;
}

let tt;
export function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1600);
}
void VIEWS; void TEX;
