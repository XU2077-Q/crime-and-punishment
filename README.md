# 罪与罚 · 导赏视觉小说（删节版）

一个为初读者准备的《罪与罚》介绍导赏视觉小说：约 20 分钟的删节主线，
配有导赏卡片和回想功能。纯静态网页，无任何依赖，可直接部署到 GitHub Pages。

## 游玩

本地：

```bash
npx serve .        # 或任意静态服务器；file:// 直接打开会被 CORS 挡音频
```

线上：<https://xu2077-q.github.io/crime-and-punishment/>

## 操作

- 点击 / 空格 / 回车 / →：推进（打字中再按一次直接显示全句）
- `H`：回想面板
- `M`：音乐开关
- 右上 `≡`：回标题（进度自动存档，可从标题「继续」）

## 内容结构

序章·导读 → 第一幕·彼得堡的闷热 → 第二幕·罪 → 第三幕·罚 →
第四幕·索尼娅 → 第五幕·大地 → 尾声·复活

共七章，保留主干情节，细节大幅删节，导赏卡解释关键意象
（闷热、虱子、红线、超人理论、大地之吻等）。

## 美术

十张背景由 Seedream 5.0 pro 生成，风格按极简文学插画（大留白、剪影、
红线象征）叠加水粉印象派（浓雾、冷暖反光、松散笔触）的文学封面路线。
工单与生成驱动见 `tools/gen_bg_plan.js`。

## 音乐

拉赫玛尼诺夫《第二钢琴协奏曲》Op.18 选段，按情节分段剪辑：

| 段落 | 乐章选段 | 场景 |
|---|---|---|
| theme_city | 第三乐章开头 | 城市、对峙 |
| theme_crime | 第一乐章钟声和弦 | 罪 |
| theme_longing | 第一乐章第二主题 | 独白、内心 |
| theme_sonya | 第二乐章 | 索尼娅 |
| theme_rebirth | 第三乐章终曲 | 复活 |

录音：MusOpen — Skidmore College Orchestra，指挥 Anthony Holland
（2011-05-14），经 [IMSLP](https://imslp.org/) 获取，
许可 **CC BY-SA 3.0**。本项目音频部分因此同样以 CC BY-SA 3.0 使用。

## 工程

- `index.html` / `css/style.css` / `js/engine.js` / `js/script.js`：全部手写，无框架
- `tools/cut_mp3.js`：纯 Node 帧级 MP3 剪辑（无 ffmpeg）
- `tools/webcheck.js`：CDP 全剧情回归（37 张截图 + 控制台零报错断言）
- `tools/gen_bg_plan.js`：AI 出图驱动（key 只读仓库外 `%TEMP%/.ark_plan_key`）

文字为根据公版原著的中文删节改写。
