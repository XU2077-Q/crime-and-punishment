/* ============================================================
   扩容阶段 4：三段高潮场景循环视频经官方 AgentPlan skill 出片
   ----------------------------------------------------------------
   走官方 byted-ark-seedance-skill（/api/plan/v3，AgentPlan key）。
   不读项目 .env，只认 ark- 前缀的 AgentPlan key。

   【key 纪律】（与时局图 gen_blocks_plan.js 相同）
   · 本脚本不接受任何命令行 key 参数，也不打印 key。
   · key 只从仓库外的临时文件读：%TEMP%/.ark_plan_key（一行，ark- 开头），
     读进来后仅作为 ARK_API_KEY / API_KEY 注入子进程环境，
     不进 shell 历史、不进进程命令行。批次结束应删除该临时文件。

   【无缝循环策略】
   同一张静态 jpg 同时作为首帧与尾帧（skill：1 张=首帧，2 张=首尾帧），
   视频起止于同一画面，天然闭环；不再需要 ffmpeg 交叉淡化缝合。
   ffmpeg 只用于压体积（≤3MB，缩到 1024x576，CRF 28，去音轨）。

   用法：
     node tools/gen_videos_plan.js --list            看视频工单
     node tools/gen_videos_plan.js --dry             逐段调子 skill --dry-run，
                                                     不联网、不读 key，只核请求体
     node tools/gen_videos_plan.js --only pawnshop_loop   真出一段
     node tools/gen_videos_plan.js --missing --yes   出齐所有未完成的
     node tools/gen_videos_plan.js --only x --force --yes 废片重出
     node tools/gen_videos_plan.js --pack            压体积并落盘 assets/video/ + 写 manifest
     node tools/gen_videos_plan.js --qa              本地质检（存在/体积/时长/分辨率）

   出片固定参数：
     --duration 5 --ratio 16:9 --resolution 720p
     --watermark false --generate-audio false
   降级链：改措辞重试 → 去人物纯空镜 → 砍掉该段 → 全部砍掉
   （manifest 留空，站点按阶段 3 状态照常出货）。
   ============================================================ */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(__dirname, "video_manifest.json");
const STAGING = path.join(__dirname, "video_staging");
const OUT_DIR = path.join(ROOT, "assets", "video");
const MANIFEST_OUT = path.join(OUT_DIR, "manifest.json");
const KEY_FILE = path.join(os.tmpdir(), ".ark_plan_key");
const MAX_BYTES = 3 * 1024 * 1024; // 每段 ≤3MB

/* skill 的 seedance-wrapper.js 候选位置（用户用官方命令装到项目或用户目录） */
const SKILL_CANDIDATES = [
	path.join(ROOT, ".claude", "skills", "byted-ark-seedance-skill", "scripts", "seedance-wrapper.js"),
	path.join(ROOT, ".agents", "skills", "byted-ark-seedance-skill", "scripts", "seedance-wrapper.js"),
	path.join(os.homedir(), ".claude", "skills", "byted-ark-seedance-skill", "scripts", "seedance-wrapper.js"),
	path.join(os.homedir(), ".agents", "skills", "byted-ark-seedance-skill", "scripts", "seedance-wrapper.js"),
];

/* ---------------------- 视频工单 ----------------------
   审核纪律：禁 杀/血/斧/刀/尸/死/自杀/枪；用「跪俯」「低头伫立」「红丝线」替代。
   bg = assets/bg/<bg>.jpg，同时作首帧与尾帧。prompt2 为降级措辞（去人物纯空镜）。 */
const ORDERS = [
	{
		name: "pawnshop_loop", bg: "pawnshop", scene: "act3",
		prompt: "昏暗的旧当铺室内，一盏烛光轻轻摇曳，空无人物的房间，旧沙发与木柜的剪影，一条红色丝线从画面下方缓缓蜿蜒流过，水粉画质感，雾气缓缓漂移，镜头极缓慢推近，氛围压抑安静，无缝循环",
		prompt2: "昏暗的旧室内，一盏烛光轻轻摇曳，空无人物的房间，旧家具剪影，红色丝线沿地面缓缓蜿蜒，水粉画质感，雾气漂移，镜头极缓慢推近，无缝循环",
	},
	{
		name: "square_loop", bg: "square", scene: "act10",
		prompt: "冬日黄昏的城市广场，远处人群剪影缓缓走过，一个孤独剪影久久跪俯在地面，红色丝线沿地面蜿蜒穿过人群，水粉画质感，雾气缓缓流动，镜头极缓慢横移，肃穆安静，无缝循环",
		prompt2: "冬日黄昏的城市广场，远处人群剪影缓缓走过，空旷的地面，红色丝线沿地面蜿蜒穿过，水粉画质感，雾气流动，镜头极缓慢横移，无缝循环",
	},
	{
		name: "siberia_loop", bg: "siberia", scene: "epilogue",
		prompt: "荒原清晨，灰色河流与木栅栏剪影，天际渐渐亮起泛出微金，一条红色丝线随风轻轻起伏飘动，水粉画质感，雾气缓慢流动，镜头极缓推近，安静辽阔，无缝循环",
		prompt2: "荒原清晨，灰色河流与栅栏剪影，天际渐渐亮起泛出微金，红色丝线随风轻轻飘动，水粉画质感，雾气缓慢流动，镜头极缓推近，无缝循环",
	},
];

/* ---------------------- 参数 ---------------------- */

function parseArgs(argv) {
	const a = { only: null, force: false, yes: false, dry: false, list: false, qa: false, pack: false, degraded: false };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--dry") a.dry = true;
		else if (v === "--list") a.list = true;
		else if (v === "--force") a.force = true;
		else if (v === "--yes" || v === "-y") a.yes = true;
		else if (v === "--qa") a.qa = true;
		else if (v === "--pack") a.pack = true;
		else if (v === "--degraded") a.degraded = true; // 用 prompt2（去人物空镜）
		else if (v === "--model") a.model = argv[++i];
		else if (v.startsWith("--model=")) a.model = v.slice(8);
		else if (v === "--missing") { /* 默认就是只出未完成的 */ }
		else if (v === "--only") a.only = argv[++i];
		else if (v.startsWith("--only=")) a.only = v.slice(7);
		else { console.error("认不出的参数：" + v); process.exit(2); }
	}
	if (a.only) a.only = a.only.split(",").map((s) => s.trim()).filter(Boolean);
	return a;
}

function loadState() {
	if (!fs.existsSync(STATE)) return { version: 1, videos: {} };
	return JSON.parse(fs.readFileSync(STATE, "utf8"));
}
function saveState(s) {
	fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");
}

function findSkill() {
	for (const p of SKILL_CANDIDATES) if (fs.existsSync(p)) return p;
	return null;
}

function findFfmpeg() {
	for (const c of ["ffmpeg", "ffmpeg.exe"]) {
		const r = spawnSync(c, ["-version"], { stdio: "pipe" });
		if (!r.error && r.status === 0) return c;
	}
	return null;
}

function readKey() {
	if (!fs.existsSync(KEY_FILE)) {
		console.error("缺 key：请先让用户粘贴 AgentPlan key，并写入仓库外的 " + KEY_FILE + "（一行，ark- 开头）。");
		process.exit(2);
	}
	const key = fs.readFileSync(KEY_FILE, "utf8").trim();
	if (!/^ark-/.test(key)) { console.error(KEY_FILE + " 里的内容不是 ark- 开头，拒绝使用。"); process.exit(2); }
	return key; // 只进子进程环境，绝不打印
}

/* ---------------------- 子 skill 调用 ---------------------- */

function buildArgs(order, opts) {
	const bgPath = path.join(ROOT, "assets", "bg", order.bg + ".jpg");
	if (!fs.existsSync(bgPath)) throw new Error("缺首帧底图：" + bgPath);
	const args = [
		"create",
		"--prompt", opts.degraded ? order.prompt2 : order.prompt,
		"--duration", "5",
		"--ratio", "16:9",
		"--resolution", "720p",
		"--watermark", "false",
		"--generate-audio", "false",
		"--image-file", bgPath, // 首帧
		"--image-file", bgPath, // 尾帧 = 同一画面 → 天然无缝循环
		"--wait", "true",
		"--offline-models",
	];
	if (opts.model) args.push("--model", opts.model);
	if (opts.dry) args.push("--dry-run");
	return args;
}

function runSkill(skillScript, order, opts, key) {
	const args = buildArgs(order, opts);
	console.log(`  · ${order.name}：seedance-wrapper create ${opts.dry ? "（--dry-run）" : ""}`);
	const env = { ...process.env, ARK_SEEDANCE_SAVE_PATH: STAGING };
	if (!opts.dry && key) { env.ARK_API_KEY = key; env.API_KEY = key; }
	const r = spawnSync("node", [skillScript, ...args], {
		env, encoding: "utf8", timeout: 25 * 60 * 1000, // --wait 上限 20 分钟，留余量
	});
	if (r.error) throw r.error;
	const out = (r.stdout || "").trim();
	// dry-run：stdout 是单个 JSON，直接透传打印（其中 base64 已脱敏）
	if (opts.dry) { console.log("    " + out.split("\n").join("\n    ")); return { dry: true, out }; }
	if (r.status !== 0) {
		console.error("    × skill 退出码 " + r.status + "：" + (r.stderr || out).slice(0, 500));
		return { ok: false };
	}
	// 正式：从 stdout 里抠 JSON（skill 可能先打印进度行）
	let j = null;
	const m = out.match(/\{[\s\S]*\}/);
	if (m) { try { j = JSON.parse(m[0]); } catch (_) { /* 落到下面报错 */ } }
	if (!j) { console.error("    × 没解析到结果 JSON：" + out.slice(0, 500)); return { ok: false }; }
	return { ok: true, result: j };
}

/* ---------------------- pack / qa ---------------------- */

function packOne(ffmpeg, order, st) {
	const v = st.videos[order.name];
	if (!v || !v.staging || !fs.existsSync(v.staging)) { console.log(`  · ${order.name}：无 staging 成片，跳过`); return false; }
	fs.mkdirSync(OUT_DIR, { recursive: true });
	const out = path.join(OUT_DIR, order.name + ".mp4");
	// 缩到 1024x576（与静态图一致）、CRF 28、去音轨、faststart
	const r = spawnSync(ffmpeg, [
		"-y", "-i", v.staging,
		"-vf", "scale=1024:576",
		"-c:v", "libx264", "-crf", "28", "-preset", "slow",
		"-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
		out,
	], { stdio: "pipe" });
	if (r.error || r.status !== 0) { console.error(`  × ${order.name} 压制失败：` + (r.stderr || "").slice(-300)); return false; }
	const sz = fs.statSync(out).size;
	v.final = out; v.finalBytes = sz; v.packedAt = new Date().toISOString();
	console.log(`  · ${order.name} → assets/video/${order.name}.mp4（${(sz / 1048576).toFixed(2)}MB${sz > MAX_BYTES ? "，超 3MB 预算！" : ""}）`);
	return sz <= MAX_BYTES;
}

function writeManifest(state) {
	const loops = ORDERS.filter(o => {
		const v = state.videos[o.name];
		return v && v.final && fs.existsSync(v.final);
	}).map(o => o.name);
	fs.mkdirSync(OUT_DIR, { recursive: true });
	fs.writeFileSync(MANIFEST_OUT, JSON.stringify({ loops }) + "\n");
	console.log("  · manifest.json = { loops: [" + loops.join(", ") + "] }");
}

function qa(state, ffmpeg) {
	let bad = 0;
	for (const o of ORDERS) {
		const f = path.join(OUT_DIR, o.name + ".mp4");
		if (!fs.existsSync(f)) { console.log(`  · ${o.name}：缺（未出片）`); continue; }
		const sz = fs.statSync(f).size;
		let info = `${(sz / 1048576).toFixed(2)}MB`;
		if (ffmpeg) {
			const p = spawnSync(ffmpeg.replace("ffmpeg", "ffprobe"), [
				"-v", "error", "-select_streams", "v:0",
				"-show_entries", "stream=width,height:format=duration",
				"-of", "json", f,
			], { encoding: "utf8" });
			if (!p.error && p.status === 0) {
				try {
					const j = JSON.parse(p.stdout);
					info += ` ${j.streams[0].width}x${j.streams[0].height} ${Number(j.format.duration).toFixed(1)}s`;
				} catch (_) { /* 探不出就只报体积 */ }
			}
		}
		const over = sz > MAX_BYTES;
		if (over) bad++;
		console.log(`  ${over ? "×" : "·"} ${o.name}：${info}${over ? " 超预算" : ""}`);
	}
	const mf = JSON.parse(fs.readFileSync(MANIFEST_OUT, "utf8"));
	const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith(".mp4")).map(f => f.replace(/\.mp4$/, ""));
	const drift = files.filter(f => !mf.loops.includes(f)).concat(mf.loops.filter(l => !files.includes(l)));
	if (drift.length) { bad++; console.log("  × manifest 与文件不一一对应：" + drift.join(", ")); }
	else console.log("  · manifest 与文件一一对应（" + mf.loops.length + " 段）");
	return bad === 0;
}

/* ---------------------- 主流程 ---------------------- */

function main() {
	const a = parseArgs(process.argv.slice(2));
	const state = loadState();

	if (a.list) {
		for (const o of ORDERS) {
			const v = state.videos[o.name];
			console.log(`  ${o.name}（${o.scene}，首帧=${o.bg}.jpg）：${v && v.status ? v.status : "未出片"}`);
		}
		console.log("\n  首条 prompt：" + ORDERS[0].prompt);
		return;
	}

	if (a.qa) { process.exit(qa(state, findFfmpeg()) ? 0 : 1); }

	if (a.pack) {
		const ff = findFfmpeg();
		if (!ff) { console.error("缺 ffmpeg：请先安装（winget install --id Gyan.FFmpeg -e）再 --pack。"); process.exit(2); }
		let ok = true;
		for (const o of ORDERS) if (!a.only || a.only.includes(o.name)) ok = packOne(ff, o, state) && ok;
		saveState(state);
		writeManifest(state);
		process.exit(ok ? 0 : 1);
	}

	const skill = findSkill();
	if (!skill) {
		console.error("缺 byted-ark-seedance-skill。请用官方命令安装后重试：");
		console.error('  npx --yes skills@latest add "https://skills.volces.com/skills/volcengine/agentplan" -s byted-ark-seedance-skill --agent claude-code --yes');
		process.exit(2);
	}
	console.log("  skill：" + skill);

	const targets = ORDERS.filter(o => {
		if (a.only) return a.only.includes(o.name);
		const v = state.videos[o.name];
		return !v || v.status !== "done" || a.force;
	});
	if (!targets.length) { console.log("  没有待出的视频。--list 看状态，--force 重出。"); return; }
	if (!a.dry && targets.length > 1 && !a.yes) {
		console.error("  一次要出 " + targets.length + " 段（要花钱）。确认请加 --yes。");
		process.exit(2);
	}
	const key = a.dry ? null : readKey();

	fs.mkdirSync(STAGING, { recursive: true });
	for (const o of targets) {
		const r = runSkill(skill, o, a, key);
		if (a.dry) continue;
		const v = state.videos[o.name] = state.videos[o.name] || {};
		if (r.ok && r.result) {
			// skill 返回里找下载后的本地路径与任务 ID（字段名以实际返回为准，宽松匹配）
			const j = r.result;
			v.taskId = j.task_id || j.taskId || j.id || null;
			const lp = j.local_path || j.localPath || j.video_path || (j.download && (j.download.local_path || j.download.path));
			if (lp && fs.existsSync(lp)) {
				// 挪进 staging 统一管理
				const dst = path.join(STAGING, o.name + ".mp4");
				fs.copyFileSync(lp, dst);
				v.staging = dst; v.status = "generated";
				console.log(`    √ 成片已落 staging（task ${v.taskId || "?"}）`);
			} else {
				v.status = "submitted"; // 任务交了但没拿到本地文件——用 skill 的 get --task-id 追
				console.log("    ! 任务已提交但未落盘，task=" + v.taskId + "，可用 skill 的 get 追。原始返回：" + JSON.stringify(j).slice(0, 300));
			}
			v.promptUsed = a.degraded ? o.prompt2 : o.prompt;
		} else {
			v.status = "failed";
			console.error("    × " + o.name + " 失败（可 --degraded 换去人物空镜措辞重试，或按降级链砍掉该段）");
		}
		saveState(state);
	}
	if (!a.dry) console.log("\n  提示：--pack 压体积落盘 assets/video/ 并写 manifest；--qa 质检。");
}

main();
