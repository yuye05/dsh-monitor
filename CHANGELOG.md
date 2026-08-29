# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

### Added

- **智谱 GLM-5.3-Flash 支持**：新增 `fetch_glm.js` 抓智谱官网 `open.bigmodel.cn/finance-center/finance/overview`，显示 GLM 余额 + 本月消费（GLM 卡片下方独立橙色条）
- **三模型卡片**：V4 Pro / V4 Flash Vision / GLM-5.3-Flash 并列（V4 Pro 走官网 per-model，V4 Flash Vision 走官网 + 本地命中率，GLM 走本地 jsonl）
- GLM 费用折算：智谱中国区固定价（输入 0.8 / 输出 2.8 / 缓存 0.23 元，无峰谷）
- **深色「能源仪表舱」UI**（可切浅色）：深墨底 + 暖金弧环余额表 + 冷青缓存命中 + 等宽数字；标题栏主题按钮深浅切换并记忆（localStorage）
- **余额弧环**：余额外的 260° 弧环 = 今日消耗占预算（阈值来自 `today_cost_alert_threshold`），越阈值转红

### Changed

- 从"V4 Flash / V4 Pro 两模型"升级为三模型池，移除已弃用的 `deepseek-v4-flash` 非视觉版与 `qwen3.7-plus`
- 模型卡片"来源"标签区分 DeepSeek(官网) 与 GLM(本地)——因智谱官网无 per-model token 明细
- `ui/` 全面重设计：余额卡改为"弧环 + 居中读数"，模型名/标签不再截断换行，移除底部横向滚动条，数字统一黑体，图表语义色经 dataviz 色板验证（深底全 PASS）
- README / CONTRIBUTING 更新：新增智谱登录说明、三模型功能、GLM 数据源说明

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
