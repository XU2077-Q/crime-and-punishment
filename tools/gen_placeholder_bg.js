// 生成 10 张程序化 SVG 占位背景（1600×900）
// 风格骨架：大留白 + 剪影 + 红线；雾气用模糊椭圆叠印象派冷暖反光
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'bg');
fs.mkdirSync(OUT, { recursive: true });

const W = 1600, H = 900;

// 公共骨架：天空渐变 + 雾团 + 剪影层 + 可选红线
function frame({ id, sky, mists = [], bodies = '', thread = null, glow = null }) {
  const mistEls = mists.map((m, i) =>
    `<ellipse cx="${m.x}" cy="${m.y}" rx="${m.rx}" ry="${m.ry}" fill="${m.c}" opacity="${m.o}" filter="url(#blur${m.b || 40})"/>`
  ).join('\n  ');
  const blurs = [...new Set(mists.map(m => m.b || 40))].map(b =>
    `<filter id="blur${b}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${b}"/></filter>`
  ).join('\n    ');
  const threadEl = thread
    ? `<path d="${thread.d}" fill="none" stroke="#a8232a" stroke-width="${thread.w || 2.5}" opacity="${thread.o ?? 0.8}" stroke-linecap="round"/>`
    : '';
  const glowEl = glow
    ? `<circle cx="${glow.x}" cy="${glow.y}" r="${glow.r}" fill="${glow.c}" opacity="${glow.o}" filter="url(#blur${glow.b || 30})"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      ${sky.map((s, i) => `<stop offset="${(i / (sky.length - 1)).toFixed(2)}" stop-color="${s}"/>`).join('\n      ')}
    </linearGradient>
    ${blurs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${glowEl}
  ${mistEls}
  ${bodies}
  ${threadEl}
  <!-- ${id} -->
</svg>`;
}

// 简易人形剪影（头圆+梯形身体）
function person(x, y, s, c = '#0b0d10', op = 1) {
  return `<g fill="${c}" opacity="${op}">
    <circle cx="${x}" cy="${y - 34 * s}" r="${11 * s}"/>
    <path d="M${x - 13 * s},${y - 20 * s} Q${x},${y - 30 * s} ${x + 13 * s},${y - 20 * s} L${x + 10 * s},${y + 30 * s} L${x - 10 * s},${y + 30 * s} Z"/>
  </g>`;
}
// 屋顶天际线：给定一串 [x, 高度, 宽度] 生成剪影
function skyline(base, blocks, c = '#101216') {
  let d = `M0,${H} L0,${base}`;
  for (const [x, h, w] of blocks) d += ` L${x},${base} L${x},${base - h} L${x + w},${base - h} L${x + w},${base}`;
  d += ` L${W},${base} L${W},${H} Z`;
  return `<path d="${d}" fill="${c}"/>`;
}

const scenes = {
  // 1 标题：墨水夜空、尖顶、孤影、斜贯红线
  title: frame({
    id: 'title',
    sky: ['#141821', '#1d2331', '#0b0d10'],
    glow: { x: 1180, y: 190, r: 90, c: '#e8e4da', o: 0.5, b: 18 },
    mists: [
      { x: 400, y: 620, rx: 520, ry: 150, c: '#3d4b63', o: 0.25 },
      { x: 1150, y: 560, rx: 480, ry: 130, c: '#5a6d8a', o: 0.18, b: 60 },
      { x: 800, y: 800, rx: 700, ry: 120, c: '#242b3a', o: 0.35, b: 50 },
    ],
    bodies: `
  ${skyline(700, [[120, 90, 130], [330, 150, 90], [500, 60, 180], [760, 110, 120], [950, 55, 200], [1230, 130, 100], [1400, 70, 160]], '#0e1116')}
  <path d="M330,550 L362,300 L370,300 L375,550 Z" fill="#0e1116"/>
  <path d="M368,300 L368,220 M360,235 L376,235" stroke="#0e1116" stroke-width="5"/>
  ${person(800, 770, 1.4, '#05070a')}`,
    thread: { d: 'M-20,180 C400,260 900,120 1620,330', w: 3, o: 0.85 },
  }),

  // 2 彼得堡：闷黄雾、运河桥栏杆、歪斜楼群
  petersburg: frame({
    id: 'petersburg',
    sky: ['#8a7a52', '#a89568', '#6e6248'],
    glow: { x: 300, y: 160, r: 120, c: '#e8d9a8', o: 0.55, b: 40 },
    mists: [
      { x: 800, y: 400, rx: 900, ry: 200, c: '#c9b98a', o: 0.35, b: 70 },
      { x: 400, y: 560, rx: 500, ry: 140, c: '#9aa08a', o: 0.25, b: 50 },
      { x: 1250, y: 520, rx: 450, ry: 120, c: '#b5a678', o: 0.3, b: 45 },
    ],
    bodies: `
  ${skyline(520, [[40, 190, 170], [260, 260, 120], [420, 150, 200], [660, 300, 110], [820, 180, 190], [1060, 240, 140], [1250, 160, 180], [1470, 210, 130]], '#4a4030')}
  <rect x="0" y="700" width="1600" height="200" fill="#3a3428"/>
  <path d="M0,700 Q800,660 1600,700 L1600,730 Q800,690 0,730 Z" fill="#57503e"/>
  <g stroke="#2c2820" stroke-width="6">${Array.from({ length: 21 }, (_, i) => `<line x1="${i * 80}" y1="668" x2="${i * 80}" y2="700"/>`).join('')}</g>
  ${person(560, 690, 1.0, '#221f18', 0.9)}
  ${person(1120, 686, 0.85, '#221f18', 0.7)}`,
    thread: { d: 'M-20,640 C500,600 1000,660 1620,610', w: 2, o: 0.35 },
  }),

  // 3 酒馆：琥珀暖光、柜台、酒瓶、伏倒的人
  tavern: frame({
    id: 'tavern',
    sky: ['#2a1c10', '#3d2812', '#1a110a'],
    glow: { x: 800, y: 240, r: 200, c: '#d5a05a', o: 0.4, b: 60 },
    mists: [
      { x: 800, y: 300, rx: 600, ry: 180, c: '#8a5c28', o: 0.3, b: 70 },
      { x: 300, y: 500, rx: 350, ry: 120, c: '#5c3c1c', o: 0.3, b: 50 },
      { x: 1300, y: 480, rx: 380, ry: 130, c: '#6e4a22', o: 0.25, b: 45 },
    ],
    bodies: `
  <rect x="0" y="560" width="1600" height="90" fill="#241408"/>
  <rect x="0" y="650" width="1600" height="250" fill="#160d05"/>
  ${[300, 430, 560, 1040, 1170, 1300].map(x =>
    `<path d="M${x},560 L${x},470 Q${x},450 ${x + 12},450 L${x + 24},450 Q${x + 36},450 ${x + 36},470 L${x + 36},560 Z" fill="#0f0903"/>`).join('')}
  <g fill="#0c0702">
    <circle cx="820" cy="600" r="26"/>
    <path d="M790,650 Q820,610 850,650 L870,690 L770,690 Z"/>
  </g>
  ${person(1120, 700, 1.15, '#0f0903')}`,
  }),

  // 4 阁楼：斜顶、小窗冷光、蜷缩的床
  garret: frame({
    id: 'garret',
    sky: ['#23262c', '#2e3138', '#17191d'],
    glow: { x: 1150, y: 300, r: 110, c: '#9fb3c9', o: 0.4, b: 26 },
    mists: [
      { x: 1150, y: 380, rx: 320, ry: 160, c: '#5a6d82', o: 0.22, b: 50 },
      { x: 400, y: 650, rx: 500, ry: 140, c: '#2c3038', o: 0.4, b: 55 },
    ],
    bodies: `
  <path d="M0,0 L900,0 L700,240 L0,420 Z" fill="#121418"/>
  <path d="M1600,0 L900,0 L700,240 L1600,380 Z" fill="#0e1013"/>
  <g transform="translate(1090,240)">
    <rect width="120" height="150" fill="#c9d6e2" opacity="0.75"/>
    <rect x="55" width="10" height="150" fill="#17191d"/>
    <rect y="70" width="120" height="10" fill="#17191d"/>
  </g>
  <path d="M180,760 Q420,690 640,740 L660,800 L160,810 Z" fill="#0b0d10"/>
  <ellipse cx="430" cy="725" rx="90" ry="26" fill="#05070a"/>
  ${person(430, 740, 0.8, '#05070a', 0.9)}`,
  }),

  // 5 当铺：冷绿灰、门缝红光、楼梯、老妇剪影
  pawnshop: frame({
    id: 'pawnshop',
    sky: ['#2c332e', '#39423a', '#1c221e'],
    mists: [
      { x: 500, y: 300, rx: 500, ry: 170, c: '#4d5a4e', o: 0.25, b: 60 },
      { x: 1100, y: 600, rx: 480, ry: 150, c: '#333c34', o: 0.35, b: 50 },
    ],
    bodies: `
  <rect x="1020" y="180" width="220" height="560" fill="#141a15"/>
  <rect x="1132" y="180" width="8" height="560" fill="#a8232a" opacity="0.9"/>
  <circle cx="1120" cy="470" r="8" fill="#0b0d10"/>
  <path d="M0,900 L0,760 L120,760 L120,700 L240,700 L240,640 L360,640 L360,900 Z" fill="#10150f"/>
  ${Array.from({ length: 6 }, (_, i) => `<line x1="${i * 60}" y1="${760 - Math.min(i, 2) * 60}" x2="${i * 60 + 60}" y2="${760 - Math.min(i + 1, 2) * 60}" stroke="#1e2620" stroke-width="4"/>`).join('')}
  <g fill="#080b08">
    <circle cx="880" cy="600" r="22"/>
    <path d="M852,622 Q880,600 908,622 L924,720 Q880,742 836,720 Z"/>
    <path d="M872,700 L846,760 M890,700 L916,760" stroke="#080b08" stroke-width="10"/>
  </g>
  ${person(1330, 760, 1.5, '#05070a')}`,
    thread: { d: 'M1140,740 C1000,760 800,820 560,860', w: 2.5, o: 0.6 },
  }),

  // 6 梦马：黑场夜、人群剪影、瘦马
  dream_horse: frame({
    id: 'dream_horse',
    sky: ['#17121a', '#241c26', '#0e0a10'],
    glow: { x: 800, y: 520, r: 260, c: '#8a4a3a', o: 0.28, b: 80 },
    mists: [
      { x: 300, y: 250, rx: 400, ry: 130, c: '#3a2c3e', o: 0.3, b: 60 },
      { x: 1250, y: 280, rx: 420, ry: 120, c: '#2e2433', o: 0.3, b: 55 },
    ],
    bodies: `
  <path d="M0,900 L0,720 L1600,700 L1600,900 Z" fill="#0a080c"/>
  <g fill="#050408">
    <ellipse cx="800" cy="640" rx="130" ry="60"/>
    <path d="M910,610 Q960,560 985,590 Q1000,610 975,625 L940,640 Z"/>
    <path d="M690,650 L675,760 M740,660 L735,770 M850,660 L860,770 M905,645 L925,755" stroke="#050408" stroke-width="14"/>
  </g>
  ${[200, 320, 1180, 1320, 1450, 480, 1080].map((x, i) => person(x, 740 - (i % 3) * 8, 1.05 + (i % 2) * 0.2, '#070509', 0.95)).join('')}
  <path d="M340,700 L420,560 M1280,690 L1360,540" stroke="#070509" stroke-width="9"/>`,
    thread: { d: 'M760,640 C700,700 640,760 580,830', w: 2, o: 0.7 },
  }),

  // 7 波尔菲里：审问室、桌面灯锥、两把椅子
  porfiry: frame({
    id: 'porfiry',
    sky: ['#26221c', '#322c22', '#191611'],
    glow: { x: 800, y: 260, r: 60, c: '#d5b97a', o: 0.7, b: 14 },
    mists: [
      { x: 800, y: 400, rx: 300, ry: 220, c: '#8a7648', o: 0.16, b: 60 },
    ],
    bodies: `
  <path d="M760,300 L560,760 L1040,760 L840,300 Z" fill="#d5b97a" opacity="0.10"/>
  <path d="M770,250 L830,250 L850,300 L750,300 Z" fill="#0e0c08"/>
  <rect x="480" y="640" width="640" height="40" fill="#14110b"/>
  <rect x="520" y="680" width="30" height="180" fill="#0f0d08"/>
  <rect x="1050" y="680" width="30" height="180" fill="#0f0d08"/>
  <g fill="#0a0805">
    <path d="M330,860 L330,700 L390,700 L390,860 Z M320,700 L400,700 L400,680 L320,680 Z"/>
    <path d="M1210,860 L1210,700 L1270,700 L1270,860 Z M1200,700 L1280,700 L1280,680 L1200,680 Z"/>
  </g>
  <rect x="140" y="200" width="160" height="240" fill="#c9d6e2" opacity="0.28"/>
  ${person(660, 640, 0.9, '#0a0805')}
  ${person(950, 640, 0.95, '#0a0805')}`,
  }),

  // 8 索尼娅的房间：烛火暖金、窗上十字、两个身影
  sonya_room: frame({
    id: 'sonya_room',
    sky: ['#241d18', '#332820', '#16110d'],
    glow: { x: 1050, y: 560, r: 70, c: '#e8c987', o: 0.85, b: 20 },
    mists: [
      { x: 1050, y: 520, rx: 260, ry: 170, c: '#b08d4e', o: 0.22, b: 55 },
      { x: 400, y: 300, rx: 400, ry: 140, c: '#3a3f4d', o: 0.25, b: 60 },
    ],
    bodies: `
  <g transform="translate(240,180)">
    <rect width="180" height="260" fill="#7d94ac" opacity="0.4"/>
    <rect x="82" width="16" height="260" fill="#16110d"/>
    <rect y="120" width="180" height="16" fill="#16110d"/>
  </g>
  <path d="M0,900 L0,780 L1600,760 L1600,900 Z" fill="#100c08"/>
  <g>
    <rect x="1032" y="600" width="36" height="60" fill="#0d0a06"/>
    <rect x="1044" y="540" width="12" height="62" fill="#d8cfa8"/>
    <ellipse cx="1050" cy="532" rx="9" ry="16" fill="#f0d992"/>
  </g>
  ${person(700, 730, 1.1, '#0a0705')}
  <g transform="translate(1310,730) scale(-1.15,1.15)">${person(0, 0, 1, '#0a0705').replace('<g fill="#0a0705" opacity="1">', '').replace('</g>', '')}</g>`,
    thread: { d: 'M330,440 C600,520 860,480 1050,560', w: 2, o: 0.5 },
  }),

  // 9 干草广场：开阔广场、穹顶、跪地吻地的人、红线入土
  square: frame({
    id: 'square',
    sky: ['#7a6a4e', '#96835e', '#5c5040'],
    glow: { x: 800, y: 210, r: 130, c: '#e8d9a8', o: 0.4, b: 50 },
    mists: [
      { x: 800, y: 420, rx: 800, ry: 160, c: '#b5a678', o: 0.3, b: 70 },
      { x: 300, y: 560, rx: 400, ry: 100, c: '#8a8272', o: 0.25, b: 50 },
    ],
    bodies: `
  ${skyline(560, [[60, 140, 160], [280, 90, 220], [560, 170, 120], [1150, 120, 180], [1390, 160, 140]], '#453c2e')}
  <path d="M830,560 L830,430 Q800,430 800,390 Q800,330 830,310 Q860,330 860,390 Q860,430 830,430 Z" fill="#3a3226"/>
  <path d="M830,310 L830,240 M818,262 L842,262" stroke="#3a3226" stroke-width="6"/>
  <rect x="0" y="560" width="1600" height="340" fill="#4d4434"/>
  <ellipse cx="800" cy="760" rx="500" ry="90" fill="#57503e" opacity="0.7"/>
  <g fill="#0b0d10">
    <circle cx="788" cy="716" r="14"/>
    <path d="M776,728 Q800,716 818,736 L828,780 Q800,792 772,782 Z"/>
    <path d="M780,778 L752,806 M812,780 L838,808" stroke="#0b0d10" stroke-width="10"/>
  </g>`,
    thread: { d: 'M800,780 C700,820 500,860 320,880', w: 3, o: 0.9 },
  }),

  // 10 西伯利亚：冷蓝白荒原、河、地平线暖光带、两个人影
  siberia: frame({
    id: 'siberia',
    sky: ['#3d4b5c', '#6e8296', '#a8b8c4', '#d5cba8'],
    glow: { x: 800, y: 470, r: 150, c: '#e8d9a8', o: 0.5, b: 50 },
    mists: [
      { x: 500, y: 380, rx: 600, ry: 120, c: '#8fa2b3', o: 0.3, b: 70 },
      { x: 1200, y: 420, rx: 500, ry: 100, c: '#b8c4ce', o: 0.3, b: 60 },
      { x: 800, y: 480, rx: 900, ry: 60, c: '#e0d5b0', o: 0.35, b: 40 },
    ],
    bodies: `
  <path d="M0,520 Q800,500 1600,520 L1600,900 L0,900 Z" fill="#c4cdd4"/>
  <path d="M0,620 Q800,590 1600,640 L1600,720 Q800,670 0,700 Z" fill="#8fa2b3" opacity="0.6"/>
  <g fill="#2c3844">
    <rect x="150" y="470" width="120" height="50"/>
    <path d="M140,470 L210,438 L280,470 Z"/>
    <rect x="1380" y="475" width="100" height="45"/>
    <path d="M1372,475 L1430,448 L1488,475 Z"/>
  </g>
  ${person(760, 600, 0.75, '#1c242c', 0.9)}
  ${person(810, 598, 0.7, '#1c242c', 0.9)}`,
  }),
};

for (const [name, svg] of Object.entries(scenes)) {
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
  console.log('✓', name, (svg.length / 1024).toFixed(1) + 'KB');
}
console.log('共', Object.keys(scenes).length, '张');
