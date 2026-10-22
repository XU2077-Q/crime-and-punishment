// webcheck.js —— 在真浏览器（Edge headless=old）里把《罪与罚》VN 从头走到尾。
// 引擎状态全在 DOM 里可读（#line / #nextHint / #noteCard / #blackout / #chapterTag），
// 所以推进是闭环的：等打字机打完 → 截图/推进，不盲按时长。
// 用法：node tools/webcheck.js
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'shots');
const PORT = 9334, HTTP_PORT = 8791;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let edgeChild = null;
function killEdgeTree() {
  const c = edgeChild; if (!c || c.killed) return; edgeChild = null;
  try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (_) { try { c.kill(); } catch (_) {} }
}
process.on('exit', killEdgeTree);
process.on('uncaughtException', e => { killEdgeTree(); console.error(e); process.exit(2); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 极简静态服务器（file:// 下 fetch mp3 会被 CORS 挡，必须走 http）──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; this.errors = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        return;
      }
      const m = msg.method;
      if (m === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ');
        this.logs.push({ kind: msg.params.type, text });
        if (msg.params.type === 'error') this.errors.push(text);
      } else if (m === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text || '未知异常');
      } else if (m === 'Log.entryAdded') {
        const e = msg.params.entry;
        this.logs.push({ kind: e.level, text: `${e.level}: ${e.text}` });
        if (e.level === 'error') this.errors.push(`${e.level}: ${e.text}`);
      }
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async shot(file) {
    try {
      const r = await this.send('Page.captureScreenshot', { format: 'png' }, 20000);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return fs.statSync(file).size;
    } catch (e) { console.error('  ! 截图失败', path.basename(file), e.message); return 0; }
  }
  async click(x, y) {
    const base = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }
  async key(key, code, vk) {
    const base = { windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

  edgeChild = spawn(EDGE, [
    '--headless=old', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, 'build', '_webcheck_profile')}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find(t => t.type === 'page');
    } catch (_) {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('Edge 调试端口没起来');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  // ?fast：引擎把打字机降到 1ms/字，回归时长减半
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html?fast` });
  await sleep(2500);
  await cdp.shot(path.join(OUT, '01-标题屏.png'));

  // 点「开始」→ 音频解锁遮罩 → 再点一次进入
  await cdp.evalJS(`document.getElementById('btnStart').click()`);
  await sleep(600);
  await cdp.shot(path.join(OUT, '02-音频解锁遮罩.png'));
  await cdp.click(640, 360);
  await sleep(1500);

  const state = `(() => ({
    tag: document.getElementById('chapterTag').textContent,
    speaker: document.getElementById('speaker').textContent,
    line: document.getElementById('line').textContent,
    typingDone: document.getElementById('nextHint').classList.contains('on'),
    note: document.getElementById('noteCard').classList.contains('show'),
    black: document.getElementById('blackout').classList.contains('show'),
    blackText: document.getElementById('blackoutText').textContent,
    title: !document.getElementById('titleScreen').classList.contains('gone'),
    video: document.getElementById('bgVideo').classList.contains('show'),
  }))()`;

  const shots = [];
  let shotN = 3, lastTag = '', lastSig = '';
  const want = { // 每个场景至少留一张
    '序章 · 导读': '序章', '第一幕 · 彼得堡的闷热': '闷热', '第二幕 · 一笔账': '一笔账',
    '第三幕 · 罪': '罪', '第四幕 · 高烧': '高烧', '第五幕 · 波尔菲里': '波尔菲里',
    '第六幕 · 索尼娅与拉撒路': '索尼娅', '第七幕 · 葬礼饭局': '葬礼', '第八幕 · 认罪': '认罪',
    '第九幕 · 斯维德里盖洛夫': '斯维德里盖洛夫', '第十幕 · 大地': '大地', '尾声 · 复活': '复活',
  };
  const taken = {};

  for (let i = 0; i < 900; i++) {  // 12 章 ~280 文本拍×2 + 导赏卡 + 黑场 ≈ 620 次，留 40% 余量
    const s = await cdp.evalJS(state);
    if (s.title) { // 走完了，回标题
      await cdp.shot(path.join(OUT, `${String(shotN++).padStart(2, '0')}-终·回到标题.png`));
      console.log('  · 走完全程，回到标题屏');
      break;
    }
    if (s.black) {
      const name = `${String(shotN++).padStart(2, '0')}-黑场·${s.blackText || '无字'}.png`;
      await sleep(900); await cdp.shot(path.join(OUT, name)); shots.push(name);
      console.log(`  · 黑场：「${s.blackText}」`);
      await sleep(2000); continue;
    }
    if (s.note) {
      const name = `${String(shotN++).padStart(2, '0')}-导赏卡.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
      await cdp.click(640, 360); await sleep(700); continue;
    }
    if (!s.typingDone) { await cdp.key(' ', 'Space', 32); await sleep(250); continue; }
    // 打字机打完：换章时截一张；同章前几句也截一张
    const sig = s.tag + '|' + s.speaker + '|' + s.line.slice(0, 10);
    if (s.tag !== lastTag || !taken[s.tag]) {
      lastTag = s.tag; taken[s.tag] = true;
      const name = `${String(shotN++).padStart(2, '0')}-${want[s.tag] || '场景'}·首拍.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
      console.log(`  · ${s.tag}：${(s.speaker || '旁白')}「${s.line.slice(0, 18)}…」`);
    }
    if (sig !== lastSig && (i % 12 === 0)) {
      lastSig = sig;
      const name = `${String(shotN++).padStart(2, '0')}-中景·${s.speaker || '旁白'}.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
    }
    // 交替用空格和鼠标推进（两条输入通路都验）
    if (i % 2 === 0) await cdp.key(' ', 'Space', 32); else await cdp.click(640, 620);
    await sleep(350);
  }

  // 回想面板
  await cdp.evalJS(`document.getElementById('btnTitle').click()`); await sleep(800);
  await cdp.evalJS(`document.getElementById('btnStart').click()`); await sleep(1800);
  for (let i = 0; i < 4; i++) { await cdp.key(' ', 'Space', 32); await sleep(400); }
  await cdp.key('h', 'KeyH', 72); await sleep(700);
  await cdp.shot(path.join(OUT, `${String(shotN++).padStart(2, '0')}-回想面板.png`));
  await cdp.key('h', 'KeyH', 72);

  ws.close(); killEdgeTree(); server.close();

  const errs = cdp.errors.filter(e => !/net::|favicon/.test(e));
  console.log(`\n  截图 ${shots.length + 3} 张 → build/shots`);
  if (errs.length) { console.log(`  **报错 ${errs.length} 条**`); errs.slice(0, 10).forEach(e => console.log('   ', e.split('\n')[0])); process.exitCode = 1; }
  else console.log('  控制台零报错。');
}
main().catch(e => { killEdgeTree(); server.close(); console.error(e); process.exit(2); });
