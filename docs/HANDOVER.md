# 交接说明 · 如果世界听你的 (world-listens)

给接手的 agent / 开发者：读完这份就能接着做。用户额度紧，优先少改、说清楚再动手。

## 项目是什么

沉浸式实时 3D 网站：**如果世界听你的 / Your Imagination, Our World**。  
用户可漫游、拖太阳改时间、加删移转物体、重力/规则模式、保存/分享链接/导出图。风格定为「A 为主融入 B 柔和」（晨光电影感为主）。

- 仓库：https://github.com/linekingM/world-listens （用户 GitHub：`linekingM`）
- 线上：https://linekingm.github.io/world-listens/
- 分支：`master`；Pages 用 `scripts/deploy-pages.sh`（build + force-push `gh-pages`）
- 当前 HEAD（交接时）：`63e6dd7`（日落下降角 ~50° + `?sunset=` 参数）

## 技术栈

Vite 8 · React 19 · TypeScript · React Three Fiber · drei · postprocessing · zustand · three ~0.186  
本地：`npm install && npm run dev` → http://localhost:5173/  
测试：`tests/interactions.mjs`（Playwright，约 30 项）。`ONLY=<regex>` 跑子集。  
**用户要求：未经同意不要截图验收**（这台云机渲染一张图 40–50s，太慢）。改完直接部署给用户自己看。

## 目录要点

| 路径 | 作用 |
|---|---|
| `src/world/sun.ts` | 太阳方位/高度曲线；`?sunset=<deg>` |
| `src/world/sunLook.ts` | 太阳暖度/颜色（按高度） |
| `src/world/layout.ts` | 场景布局；`SUNSET_VIEW_AZ`（云避开落日窗） |
| `src/scene/styles/cinematic/SkyA.tsx` | 天空、太阳盘、光晕 |
| `src/scene/styles/cinematic/CloudsA.tsx` | 主视角云 + 晚霞染色 |
| `src/scene/common/PuffyClouds.tsx` | 另一套云 |
| `src/scene/common/CityHaze.tsx` | 雾/霾 |
| `src/ui/SunDial.tsx` | 时间盘（可收起）、太阳颜色手动旋钮 |
| `docs/reviews/` | 历次 Grok/Gemini brief |

原始产品 brief 在用户侧附件（会话里有）；也可看 `docs/PHASE0.md`、`README.md`。

## 太阳路线（当前）

物理优先、固定落日点、白天顺/侧光：

```
az = sunriseAz − 180 · f(clamp(dayT, −0.3, 1.3))
f(t) = t − 0.68 · sin(2πt) / (2π)   // 近日出日落减速，中午多扫
sunriseAz = sunsetAz − 180
sunsetAz 默认 26°（相对默认视线，右为正），可用 ?sunset= 改，范围 -10..60
```

- 默认相机朝 −Z（城堡方向）。日出左后、中午右后（斜顺光）、日落右前。
- **教训**：只对齐「落地那一点」不够；用户在意整段下落向量。旧版约 `(0.5, -1)` 右下；一度改成约 `(-1, -0.5)` 近似贴地平线横滑，不可接受。现下降约 50° 斜线。
- 用户可用例如：`?sunset=18` 或 `?t=18.5&sunset=18` 试落点；满意后把该数字设为默认。分享链接目前**不携带** `sunset`。

颜色（`sunLook.ts`）：暖度只跟太阳高度；17:55≈0.65，18:30=1；黎明与黄昏对称（7:00 很暖 → ~8:40 变白）。傍晚光晕收紧（太阳盘本身不缩小）。云晚霞：按高度短窗染色（以前没有）。

## 已共识但未做的大方向

用户明确：**打补丁式修太阳/雾/云只会越改越乱，很多版本物理还不如早期。**  
正规做法应按系统做，不要一项项补：

1. **光照与大气**（下一步）：物理大气散射统一天空/雾/环境光/太阳光  
2. **云**：体积云（透光、亮边、遮日、云影、晚霞自然出来）；高画质开，中/低保留简化  
3. **天气**：晴/阴/雾/雨调前两系统参数  
4. **夜晚**：月光、星空、萤火虫、灯光  

先出短方案（库、换哪些文件、保留什么、手机降级），**用户确认后再写代码**。

## 用户偏好（硬约束）

- 中文沟通；质量 > 速度；额度紧时少跑测试、不截图、Grok 写代码要能真正落地（`--always-approve --permission-mode bypassPermissions`）。
- **说清楚再动手**；用户说的可能不全对，要想到副作用（例如改路径不能毁原来好看的日落构图）。
- 勿绝对化：不要因一个小点大改一切，也不要永远只敢小改；按场景定范围。
- 勿过度 UI：少按钮少提示。
- **角色小人模式**：第三人称，等用户明确同意再开始；计划由 Grok 4.7 high 实现、监督验收。
- 太阳手动颜色旋钮：用户调好会反馈参数当默认。
- 画质档：高/中/低已有。

## 已知问题 / 债

- 时间自动播放测试曾失败（倍速按钮找不到），疑似测试与收起态耦合，未必是太阳数学问题；未再深查。
- 云目前是着色网格，**不是体积介质**：逆光无亮边、不挡光、无云影。
- 天空/太阳色/雾/云色多为分头手写曲线，互相打架 → 应用物理大气统一。
- `geometry.ts` 里有烘焙 `sunDir`，改路径时核对是否仍合理。
- GitHub Actions workflow 若要进 `.github/workflows`，需用户本机 `gh auth refresh -h github.com -s workflow`。

## 建议接手第一步

1. `git clone` / pull `master`，`npm i && npm run dev`，自己拖时间盘看白天光与 `?sunset=`。  
2. **不要**再给太阳路径打补丁。  
3. 写一页「光照与大气系统」方案给用户确认 → 再实现 → 部署。  
4. 体积云作为第二系统。

## 近期相关提交

- `63e6dd7` 下降角 + `?sunset=`
- `81a543c` 物理路径 + 暖度/光晕/晚霞
- `357e58a` 曾整段反转路径（落日轨迹坏了，已由后续提交修正落点）
- `ef6ecc5` 暖度/雾/旋钮微调

—— 交接日：2026-10-18（Asia/Shanghai）
