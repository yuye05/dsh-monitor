"""
DeepSeek Monitor — 账户余额获取

从 ~/.dsh/.credentials.yaml 读取 DEEPSEEK_API_KEY（不打印、不落盘、不进日志），
调用 GET https://api.deepseek.com/user/balance 获取真实余额。

安全约束：
- API key 只在内存中使用，绝不 print / 写日志 / 写文件
- 异常时不回显 key 内容

输出（stdout JSON）：
{"is_available": bool, "currency": str, "total_balance": str,
 "granted_balance": str, "topped_up_balance": str}
失败时输出 {"error": "..."} 并退出码 1
"""

import json
import re
import sys
import urllib.request

try:
    from data.config import CONFIG as _C
except ImportError:
    from config import CONFIG as _C

CREDENTIALS = _C["credentials_file"]
BALANCE_URL = "https://api.deepseek.com/user/balance"


def read_deepseek_key(path):
    """从 yaml 读取 DEEPSEEK_API_KEY，只返回值，不打印。"""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^\s*DEEPSEEK_API_KEY\s*:\s*(.+?)\s*$", line)
                if m:
                    val = m.group(1).strip().strip('"').strip("'")
                    if val and val.lower() not in ("null", "none"):
                        return val
    except OSError:
        pass
    return None


def fetch_balance():
    key = read_deepseek_key(CREDENTIALS)
    if not key:
        return {"error": "未找到 DEEPSEEK_API_KEY（检查 ~/.dsh/.credentials.yaml）"}

    req = urllib.request.Request(
        BALANCE_URL,
        headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": f"API HTTP {e.code}: {e.reason}"}
    except Exception as e:
        return {"error": f"请求失败: {e.__class__.__name__}"}

    if not data.get("is_available"):
        return {"error": "账户不可用", "raw": str(data)[:200]}

    infos = data.get("balance_infos") or []
    cny = next((b for b in infos if b.get("currency") == "CNY"), infos[0] if infos else None)
    if cny is None:
        return {"error": "响应中无余额信息"}

    return {
        "is_available": True,
        "currency": cny.get("currency", "CNY"),
        "total_balance": cny.get("total_balance", "0"),
        "granted_balance": cny.get("granted_balance", "0"),
        "topped_up_balance": cny.get("topped_up_balance", "0"),
    }


if __name__ == "__main__":
    result = fetch_balance()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if "error" not in result else 1)
