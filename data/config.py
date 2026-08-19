"""
DeepSeek Monitor — 配置加载

从项目根目录读取 config.json（可选）。config.json 不存在时用基于用户主目录
推导的默认值，不写死某台机器的用户名路径。

需要自定义时：复制 config.example.json 为 config.json 并修改字段。

字段：
- node_path         npm 全局 node_modules（含 @playwright/test），供 fetch_official.js。
                    留空则不动环境变量 NODE_PATH，由 node 自行解析
- credentials_file  DeepSeek API key 所在文件（~/.dsh/.credentials.yaml）
- claude_projects   Claude Code 会话 jsonl 根目录（会递归扫描 **/*.jsonl）
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_HOME = os.path.expanduser("~")

DEFAULTS = {
    "node_path": "",
    "credentials_file": os.path.join(_HOME, ".dsh", ".credentials.yaml"),
    "claude_projects": os.path.join(_HOME, ".claude", "projects"),
    "balance_alert_threshold": 20,       # 余额低于此值（元）触发预警
    "today_cost_alert_threshold": 50,    # 今日消费超过此值（元）触发预警
}


def _load():
    cfg = dict(DEFAULTS)
    fp = os.path.join(ROOT, "config.json")
    if os.path.exists(fp):
        try:
            with open(fp, encoding="utf-8") as f:
                user = json.load(f)
            if isinstance(user, dict):
                cfg.update({k: v for k, v in user.items() if v})
        except Exception:
            pass  # 配置损坏时退回默认
    return cfg


CONFIG = _load()
