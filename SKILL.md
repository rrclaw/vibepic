---
name: vibepic
description: >
  启动 vibepic 氛围照片编辑器 —— 一个纯前端的小红书系照片二次创作工具：浏览器内识别画面物体
  并标注成「氛围词」括号标签(fresh/rain/us)、把整图或框选区域转成 ASCII 网点、叠加可导出的动效
  图层(ascii 雨滴/跳动音符/花朵绽放/浪花滚动/星星点点/花瓣飘落)，支持导出 PNG 与 WebM 动画。
  本 skill 负责一键拉起本地 dev server 并打开浏览器；编辑由用户在网页里手动完成(拖标签/框选/调参)。
  触发词：vibepic、跑一下 vibepic、打开 vibepic、氛围照片编辑器、ascii 照片编辑、关键词标注照片、
  照片加动效、给照片标关键词、照片 ascii 网点、启动照片编辑器。
---

# vibepic 启动器

vibepic 是一个交互式 GUI 网页编辑器（不是无头 agent 任务）。本 skill 只负责把它跑起来，
真正的编辑（识别关键词、拖动标签、框选 ASCII 区域、加动效、导出）由用户在浏览器里手动做。

项目路径：`/Users/bot/vibepic`，dev server 端口 **5180**。

## 启动流程

1. **先看是否已在跑**：
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5180/ 2>/dev/null
   ```
   返回 `200` → 已经在跑，直接跳到第 4 步开浏览器。

2. **确认依赖**：若 `/Users/bot/vibepic/node_modules` 不存在，先装：
   ```bash
   cd /Users/bot/vibepic && npm install
   ```

3. **后台起 dev server**（用 run_in_background 或重定向到日志后 detach，别阻塞）：
   ```bash
   cd /Users/bot/vibepic && npm run dev > /tmp/vibepic-dev.log 2>&1 &
   ```
   起完轮询 `curl http://localhost:5180/` 直到拿到 200（通常 1-2 秒）。

4. **打开浏览器**：
   ```bash
   open http://localhost:5180/
   ```

5. 给用户一句话回报：地址 + 三个模块怎么用（关键词 tab 点「智能识别」、ASCII tab 框选区域、动效 tab 叠加、导出 tab 出 PNG/WebM）。

## 注意

- 首次点「智能识别关键词」会动态下载 TensorFlow.js COCO-SSD 模型（几 MB），需联网，之后缓存。
- WebM 录制时预览会暂停几秒，正常。
- 这是本地工具；如果用户要部署公网，`npm run build` 产物在 `dist/`，可 `vercel deploy`。
- 不要试图替用户「自动编辑」——拖拽和框选是人手交互，本 skill 只管启动。

## 想要无头一键出图？

当前 skill 是启动器形态。若用户后续要「给图片路径自动识别+ascii+布词渲 PNG」的无头批量能力，
那是另一个独立 skill（B 形态），需另建，不在本 skill 范围。
