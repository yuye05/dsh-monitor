# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本遵循 [Semantic Versioning](https://semver.org/)。

## [1.0.0] - 2026-08-19

### Added

- pywebview 无边框置顶悬浮窗：官方用量监控（余额 / 当日消耗 / 今日 Tokens / 请求数 / per-model）
- 官方数据抓取：Playwright + headless Edge 抓 `platform.deepseek.com/usage`（"今天"+"模型"视图）
- 本地 jsonl 聚合：模型卡片缓存命中率 + 最近 7 天缓存命中柱状图
- 余额/消费预警：低于阈值变红 + 一次性 toast 通知（阈值在 config.json 配置）
- 定时自动刷新（每 10 分钟，防并发）
- 多触发点：Claude Code SessionStart hook / dsh 脚本 / dsh 桌面版
- 配置可移植：`config.example.json` → `config.json`
