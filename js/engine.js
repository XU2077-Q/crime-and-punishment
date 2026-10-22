// 《罪与罚》导赏视觉小说 · 引擎
(function () {
'use strict';

const $ = id => document.getElementById(id);
const SAVE_VERSION = 2;   // 存档格式版本：v1（无 v 字段）一律作废，老玩家回标题重来
const TYPE_MS = location.search.includes('fast') ? 1 : 30;  // webcheck 用 ?fast 加速打字机
const TRACKS = {
  city:    'assets/audio/theme_city.mp3',     // 三乐章开头：城市、对峙
  crime:   'assets/audio/theme_crime.mp3',    // 一乐章钟声和弦：罪
  longing: 'assets/audio/theme_longing.mp3',  // 一乐章第二主题：内心
  sonya:   'assets/audio/theme_sonya.mp3',    // 二乐章：索尼娅
  rebirth: 'assets/audio/theme_rebirth.mp3',  // 三乐章终曲：复活
};

// ── 状态 ──
let sceneIdx = 0, beatIdx = 0;
let typing = false, typeTimer = null, fullText = '';
let backlogData = [];
let currentMusic = null;   // 名字
let noteOpen = false, backlogOpen = false, inTitle = true;
let runId = 0;             // 每开一局 +1，用来作废上一局残留的 endGame 定时器

// ── 音频引擎（Web Audio：交叉淡化 + 循环 + 首尾淡入淡出） ──
const Audio = {
  ctx: null, master: null, cur: null, buffers: {}, muted: false,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  },
  async buffer(name) {
    if (this.buffers[name]) return this.buffers[name];
    const res = await fetch(TRACKS[name]);
    const raw = await res.arrayBuffer();
    this.buffers[name] = await this.ctx.decodeAudioData(raw);
    return this.buffers[name];
  },
  async play(name) {
    if (!this.ctx || name === currentMusic) return;
    const old = this.cur;
    if (old) this.fadeOut(old, 2.2);
    this.cur = null;
    currentMusic = name;
    if (!name) return;
    let buf;
    try { buf = await this.buffer(name); }
    catch (e) { console.warn('音频载入失败', name, e); return; }
    if (currentMusic !== name) return; // 等待期间又切了
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    // 循环缝合：结尾 1.2s 淡出由 loopStart/End 之外处理略复杂，直接用 loop + 轻微整体音量即可
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2.5);
    src.connect(g); g.connect(this.master);
    src.start();
    this.cur = { src, g };
    if (this.muted) this.master.gain.value = 0;
  },
  fadeOut(node, sec) {
    const t = this.ctx.currentTime;
    node.g.gain.cancelScheduledValues(t);
    node.g.gain.setValueAtTime(node.g.gain.value, t);
    node.g.gain.linearRampToValueAtTime(0, t + sec);
    setTimeout(() => { try { node.src.stop(); } catch (e) {} }, sec * 1000 + 100);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime + 0.3);
    $('btnMute').textContent = this.muted ? '♪̸' : '♪';
  },
};

// ── 背景（manifest 声明哪些有 .jpg 成图，其余用 .svg 占位；双层交叉淡化） ──
const Bg = {
  front: 'bgA', cache: {}, manifest: null,
  async resolve(name) {
    if (this.cache[name]) return this.cache[name];
    if (!this.manifest) {
      this.manifest = await fetch('assets/bg/manifest.json')
        .then(r => r.ok ? r.json() : { jpg: [] })
        .catch(() => ({ jpg: [] }));
    }
    const ext = (this.manifest.jpg || []).includes(name) ? 'jpg' : 'svg';
    const url = `assets/bg/${name}.${ext}`;
    this.cache[name] = url;
    return url;
  },
  async set(name) {
    const url = await this.resolve(name);
    const back = this.front === 'bgA' ? 'bgB' : 'bgA';
    $(back).style.backgroundImage = `url("${url}")`;
    $(back).classList.add('show');
    $(this.front).classList.remove('show');
    this.front = back;
  },
};

// ── 程序化动效（雾/烛光走 body 类；雪与红线光点共用唯一 rAF，按需启停） ──
const Fx = {
  raf: null, dotT: 0, lastTs: 0, snow: [],
  reduced: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches,
  set(arr) {
    const b = document.body;
    b.classList.toggle('fx-fog', arr.includes('fog'));
    b.classList.toggle('fx-candle', arr.includes('candle'));
    b.classList.toggle('fx-snow', arr.includes('snow'));
    if (arr.includes('snow') && !this.snow.length) this.seedSnow();
    this.sync();
  },
  seedSnow() {
    const n = innerWidth < 700 ? 40 : 80;
    for (let i = 0; i < n; i++) this.snow.push({
      x: Math.random(), y: Math.random(),
      r: 1 + Math.random() * 2.2,
      vy: .02 + Math.random() * .05,   // 屏高/秒
      ph: Math.random() * Math.PI * 2, // 横向摇摆相位
    });
  },
  sync() {
    const needSnow = document.body.classList.contains('fx-snow') && !this.reduced;
    const needDot = parseFloat($('thread').style.opacity || 0) > 0 && !this.reduced;
    const need = (needSnow || needDot) && !document.hidden;
    if (need && !this.raf) { this.lastTs = 0; this.raf = requestAnimationFrame(t => this.tick(t)); }
    else if (!need && this.raf) { cancelAnimationFrame(this.raf); this.raf = null; this.clearSnow(); }
  },
  tick(ts) {
    this.raf = requestAnimationFrame(t => this.tick(t));
    const dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, .1) : .016;
    this.lastTs = ts;
    if (document.body.classList.contains('fx-snow')) this.drawSnow(dt);
    if (parseFloat($('thread').style.opacity || 0) > 0) this.moveDot(dt);
  },
  drawSnow(dt) {
    const c = $('fxCanvas');
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,236,240,.85)';
    for (const p of this.snow) {
      p.y += p.vy * dt; p.ph += dt * .9;
      if (p.y > 1.02) { p.y = -.02; p.x = Math.random(); }
      const x = (p.x + Math.sin(p.ph) * .015) * w;
      g.beginPath(); g.arc(x, p.y * h, p.r, 0, 7); g.fill();
    }
  },
  clearSnow() {
    const c = $('fxCanvas');
    if (c.width) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  },
  moveDot(dt) {
    try {
      const path = $('threadPath'), len = path.getTotalLength();
      this.dotT = (this.dotT + dt * len / 26) % len;   // 26s 走完一遍
      const pt = path.getPointAtLength(this.dotT);
      const dot = $('threadDot');
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
    } catch (e) { /* headless/隐藏时拿不到几何，静默跳过 */ }
  },
};
document.addEventListener('visibilitychange', () => Fx.sync());

// ── 视频循环（manifest 列出才请求，加载失败时底层静态图天然兜底） ──
const Video = {
  el: null, manifest: null, cur: null,
  async ready() {
    if (!this.el) {
      this.el = $('bgVideo');
      this.el.addEventListener('error', () => {
        this.el.classList.remove('show');
        console.warn('视频载入失败（已回退静态背景）:', this.cur);
      });
    }
    if (!this.manifest) {
      this.manifest = await fetch('assets/video/manifest.json')
        .then(r => r.ok ? r.json() : { loops: [] })
        .catch(() => ({ loops: [] }));
    }
    return this.manifest;
  },
  async set(name) {
    const m = await this.ready();
    if (name === this.cur) return;
    this.cur = name;
    const el = this.el;
    if (!name || !(m.loops || []).includes(name)) {
      if (name) console.warn('视频不在 manifest，未请求:', name);
      el.classList.remove('show');
      setTimeout(() => {
        if (!this.cur) { el.pause(); el.removeAttribute('src'); el.load(); }
      }, 1300);
      return;
    }
    const src = `assets/video/${name}.mp4`;
    if (!el.src.endsWith(src)) el.src = src;
    try { await el.play(); el.classList.add('show'); }
    catch (e) { console.warn('视频播放失败（已回退静态背景）:', name, e); el.classList.remove('show'); }
  },
};

// ── 红线 ──
function setThread(v) {
  $('thread').style.opacity = v;
  if (v > 0) { // 重新触发描绘动画
    const p = $('threadPath');
    p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  }
  Fx.sync();
}

// ── 打字机 ──
function typeText(el, text, done, speed) {
  typing = true; fullText = text; el.textContent = '';
  let i = 0;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) finishType(el, done);
  }, speed || TYPE_MS);
}
function finishType(el, done) {
  clearInterval(typeTimer);
  el.textContent = fullText;
  typing = false;
  $('nextHint').classList.add('on');
  if (done) done();
}

// ── 演出 ──
async function showBeat() {
  const scene = SCRIPT[sceneIdx];
  const beat = scene.beats[beatIdx];
  $('chapterTag').textContent = scene.title;
  $('nextHint').classList.remove('on');
  save();

  switch (beat.type) {
    case 'bg':     await Bg.set(beat.set); next(); return;
    case 'music':  Audio.play(beat.set);   next(); return;
    case 'thread': setThread(beat.set);    next(); return;
    case 'video':  Video.set(beat.set);    next(); return;
    case 'black': {
      $('blackoutText').textContent = beat.text || '';
      $('blackout').classList.add('show');
      $('textbox').classList.add('hidden');
      if (beat.shake) {
        const app = $('app');
        app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
      }
      setTimeout(() => {
        $('blackout').classList.remove('show');
        $('textbox').classList.remove('hidden');
        next();
      }, 2600);
      return;
    }
    case 'note': {
      noteOpen = true;
      $('noteBody').textContent = beat.text;
      $('noteCard').classList.add('show');
      backlogData.push({ who: null, note: true, text: beat.text });
      return;
    }
    case 'narr': {
      $('speaker').textContent = '';
      $('speaker').className = '';
      $('line').className = ('narr ' + (beat.cls || '')).trim();
      backlogData.push({ who: null, text: beat.text });
      typeText($('line'), beat.text, null, beat.speed);
      return;
    }
    case 'say': {
      let who = beat.who, inner = false;
      if (who.startsWith('*')) { inner = true; who = who.slice(1); }
      $('speaker').textContent = who;
      $('speaker').className = inner ? 'inner' : '';
      $('speaker').style.color = CHAR_COLORS[who] || 'var(--gold)';
      $('line').className = beat.cls || '';
      backlogData.push({ who: (inner ? '〈内心〉' : '') + who, text: beat.text });
      typeText($('line'), beat.text, null, beat.speed);
      return;
    }
  }
}

function next() {
  beatIdx++;
  const scene = SCRIPT[sceneIdx];
  if (beatIdx >= scene.beats.length) {
    if (sceneIdx < SCRIPT.length - 1) { sceneIdx++; beatIdx = 0; enterScene(); }
    else endGame();
    return;
  }
  showBeat();
}

async function enterScene() {
  const scene = SCRIPT[sceneIdx];
  await Bg.set(scene.bg);
  Audio.play(scene.music);
  setThread(scene.thread || 0);
  Fx.set(scene.fx || []);
  $('app').dataset.kb = scene.kb || 'in';
  Video.set(scene.video || null);
  showBeat();
}

function endGame() {
  if (inTitle) return;  // 1600ms 落幕窗口内的多余点击会重复触发 next()，挡掉
  inTitle = true;       // 立即锁输入，等落幕
  const run = runId;
  localStorage.removeItem('cp_save');
  $('chapterTag').textContent = '终';
  $('textbox').classList.add('hidden');
  setTimeout(() => {
    if (run !== runId) return;  // 已经重开了新一局，别把标题屏盖回来
    $('titleScreen').classList.remove('gone');
    refreshTitle();
  }, 1600);
}

// ── 存档 ──
function save() {
  localStorage.setItem('cp_save', JSON.stringify({ v: SAVE_VERSION, s: sceneIdx, b: beatIdx }));
}
function readSave() {
  try {
    const sv = JSON.parse(localStorage.getItem('cp_save'));
    if (sv && sv.v === SAVE_VERSION && Number.isInteger(sv.s) && sv.s < SCRIPT.length) return sv;
  } catch (e) { /* 坏档按无档处理 */ }
  return null;
}
function refreshTitle() {
  if (localStorage.getItem('cp_save') && !readSave()) localStorage.removeItem('cp_save'); // 旧版坏档静默清
  $('btnContinue').disabled = !readSave();
}

// ── 回想 ──
function toggleBacklog() {
  backlogOpen = !backlogOpen;
  if (backlogOpen) {
    $('backlogInner').innerHTML = backlogData.map(b =>
      b.note
        ? `<div class="bNote">【导赏】</div><div class="bText">${esc(b.text)}</div>`
        : (b.who ? `<div class="bWho">${esc(b.who)}</div>` : '') + `<div class="bText">${esc(b.text)}</div>`
    ).join('');
    $('backlog').classList.add('show');
    $('backlogInner').scrollTop = $('backlogInner').scrollHeight;
  } else $('backlog').classList.remove('show');
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── 输入 ──
function advance() {
  if (inTitle || backlogOpen) return;
  if (noteOpen) { noteOpen = false; $('noteCard').classList.remove('show'); next(); return; }
  if ($('blackout').classList.contains('show')) return;
  if (typing) { finishType($('line')); return; }
  next();
}

document.addEventListener('click', e => {
  if (e.target.closest('button') || e.target.closest('#backlog') || e.target.closest('#titleScreen')) return;
  if ($('clickToStart').classList.contains('show')) return;
  advance();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') { e.preventDefault(); advance(); }
  if (e.code === 'KeyH' && !inTitle) toggleBacklog();
  if (e.code === 'KeyM') Audio.toggleMute();
  if (e.code === 'Escape' && backlogOpen) toggleBacklog();
});

$('btnBacklog').onclick = toggleBacklog;
$('backlogClose').onclick = toggleBacklog;
$('btnMute').onclick = () => Audio.toggleMute();
$('btnTitle').onclick = () => { $('titleScreen').classList.remove('gone'); inTitle = true; refreshTitle(); };
$('app').addEventListener('animationend', e => {
  if (e.animationName === 'shake') $('app').classList.remove('shake');
});

// ── 标题画面 ──
$('btnStart').onclick = () => begin(0, 0);
$('btnContinue').onclick = () => {
  const sv = readSave();
  if (sv) begin(sv.s, sv.b); else refreshTitle();
};
$('btnChapters').onclick = () => $('chapterList').classList.toggle('show');
SCRIPT.forEach((sc, i) => {
  const b = document.createElement('button');
  b.textContent = sc.title;
  b.onclick = () => begin(i, 0);
  $('chapterList').appendChild(b);
});

async function begin(s, b) {
  // 首次进入需要先解锁音频
  if (!Audio.ctx) {
    $('clickToStart').classList.add('show');
    await new Promise(res => {
      const go = () => { $('clickToStart').classList.remove('show'); res(); };
      $('clickToStart').addEventListener('click', go, { once: true });
      document.addEventListener('keydown', go, { once: true });
    });
    Audio.init();
  }
  sceneIdx = s; beatIdx = b;
  backlogData = [];
  runId++;
  inTitle = false;
  $('titleScreen').classList.add('gone');
  $('textbox').classList.remove('hidden');
  // 预载本章音乐
  if (SCRIPT[s].music) Audio.buffer(SCRIPT[s].music).catch(() => {});
  enterScene();
}

// 标题画面背景图
Bg.resolve('title').then(url => { $('titleArt').style.backgroundImage = `url("${url}")`; });
refreshTitle();

})();
