# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

### Added

- **窗口拖拽优化**：拖拽区改为 `.drag-zone`（品牌 + 顶部空白），`DRAG_REGION_DIRECT_TARGET_ONLY=False` + `easy_drag=False`——点顶部任意空白/标题即可拖动，按钮在兄弟节点不再被拖拽劫持
- **点击外部自动收起（roll-up）**：点浮窗之外（`window.blur`）→ 窗口收成顶部一根 40px 居中窄条（纯色背景、隐藏按钮，仅 logo + 标题 + ▾）；**点击窄条** → 一键展开（不悬停自动展开）
- **智谱 GLM-5.3-Flash 支持**：新增 `fetch_glm.js` 抓智谱官网 `open.bigmodel.cn/finance-center/finance/overview`，显示 GLM 余额 + 本月消费（GLM 卡片下方独立橙色条）
- **三模型卡片**：V4.1 Flash / V4 Pro / GLM-5.3-Flash 并列（V4.1 Flash 与 V4 Pro 走官网 per-model + 本地命中率，GLM 走本地 jsonl）
- **模型名归一化**：`data/prices.py:normalize_model()` 把已下线的旧模型名（`deepseek-v4-flash` / `deepseek-v4-flash-vision-exp`）折叠到规范名 `deepseek-flash`，历史用量不丢
- **官网解析器通用化**：`lib/parse_official.js` 按页面结构切段解析 per-model，不再写死模型名；配套 `tests/parse_official.test.js` 用真实页面文本做回归测试
- GLM 费用折算：智谱中国区固定价（输入 0.8 / 输出 2.8 / 缓存 0.23 元，无峰谷）
- **深色「能源仪表舱」UI**（可切浅色）：深墨底 + 暖金弧环余额表 + 冷青缓存命中 + 等宽数字；标题栏主题按钮深浅切换并记忆（localStorage）
- **余额弧环**：余额外的 260° 弧环 = 今日消耗占预算（阈值来自 `today_cost_alert_threshold`），越阈值转红

### Changed

- 从"V4 Flash / V4 Pro 两模型"升级为三模型池，移除已弃用的 `deepseek-v4-flash` 非视觉版与 `qwen3.7-plus`
- 模型卡片"来源"标签区分 DeepSeek(官网) 与 GLM(本地)——因智谱官网无 per-model token 明细
- `ui/` 全面重设计：余额卡改为"弧环 + 居中读数"，模型名/标签不再截断换行，移除底部横向滚动条，数字统一黑体，图表语义色经 dataviz 色板验证（深底全 PASS）
- README / CONTRIBUTING 更新：新增智谱登录说明、三模型功能、GLM 数据源说明
- **跟进 DeepSeek V4.1 Flash 改名**：模型池中的 `deepseek-v4-flash-vision-exp` 统一改称 **V4.1 Flash**，API 模型 ID 改用 `deepseek-flash`；flash 系列价目更新为 2026-09-10 12:00 起的降价后价格；高峰时段口径修正为**周一至周五**

### Fixed

- **模型改名导致用量丢失（2026-09-10 事故）**：DeepSeek 把 V4.1 Flash 的 API 模型 ID 从 `deepseek-v4-flash-vision-exp` 改为 `deepseek-flash` 后，因模型名写死在四处，浮窗把当天实际有大量用量的 V4.1 Flash 显示成 **"今日未使用"**（与官网页面对不上）。修复点：
  - `fetch_official.js`：写死 `indexOf` 的解析改为 `lib/parse_official.js` 通用遍历，官方 per-model 不再丢模型
  - `data/parse_usage.py` / `ui/app.js`：`PRIMARY_MODELS`、卡片过滤、官网键映射改用规范名
- **flash 系列费用折算缺口**：价目只挂了旧模型名，改名后 `price_for()` 返回 `None`，当天 flash 费用折算为 0；现补齐三段价目（含 2026-09-10 12:00 起降价：空闲 0.02 / 1 / 4）
- **周末高峰时段误判**：官方高峰时段为北京时间**周一至周五** 9-12、14-18 点，原实现只判小时不判星期，会把周末同时段按高峰价（2 倍）多算

### Security

- `.gitignore` 新增 `.glm-profile/`（智谱登录会话，同 `.edge-profile` 绝不入库）

## [1.0.0] - 2026-08-19

### Added

- pywebview 无边框置顶悬浮窗：官方用量监控（余额 / 当日消耗 / 今日 Tokens / 请求数 / per-model）
- 官方数据抓取：Playwright + headless Edge 抓 `platform.deepseek.com/usage`（"今天"+"模型"视图）
- 本地 jsonl 聚合：模型卡片缓存命中率 + 最近 7 天缓存命中柱状图
- 余额/消费预警：低于阈值变红 + 一次性 toast 通知（阈值在 config.json 配置）
- 定时自动刷新（每 10 分钟，防并发）
- 多触发点：Claude Code SessionStart hook / dsh 脚本 / dsh 桌面版
- 配置可移植：`config.example.json` → `config.json`
