# Contributing to deepseek-monitor

感谢你有兴趣改进 deepseek-monitor！

## 参与方式

- **报告 bug** — 开 issue，附复现步骤。
- **提功能建议** — 开 issue，描述使用场景。
- **发 Pull Request** — 修 bug 或加功能（见下）。

## 开发环境

```sh
git clone https://github.com/yuye05/dsh-monitor.git
cd deepseek-monitor
pip install -r requirements.txt   # Python 依赖（pywebview）
npm install                        # Node 依赖（官网抓取器 @playwright/test）
cp config.example.json config.json # 填入你的三条路径
node fetch_official.js --login     # 首次登录 DeepSeek 开放平台（会话存 .edge-profile/）
```

> ⚠️ 本项目强依赖 Windows + Claude Code 会话日志 + DeepSeek 官方登录会话，详见 README 的定位说明。

项目**无自动化测试套件**。提交前请跑冒烟检查：

```sh
python app.py          # 应弹出悬浮窗，显示官方数据
node fetch_official.js # 应输出官方今日 JSON（余额 / 消费 / Tokens / 请求数）
```

## Pull Requests

1. Fork 并从 `main` 分支切出特性分支。
2. 保持改动聚焦，一个逻辑改动一个 PR。
3. 改动涉及行为变化时，补冒烟验证。
4. 确保冒烟检查通过、diff 干净。
5. 在 PR 描述里写清 *为什么* 改，而不只是 *改了什么*。

## 贡献的许可

除非另行书面声明，否则自愿提交的贡献按本项目 [MIT](LICENSE) 条款接受。

贡献者确认自己有提交该工作的权利，且不包含从无许可、source-available、非商业、GPL、AGPL、LGPL 等不兼容来源复制的代码。

允许 AI 辅助贡献，但生成内容必须作为源代码审查，不能盲目粘贴。若贡献大幅由 AI 生成，请在 PR 描述中说明所用工具与人工审查情况。
