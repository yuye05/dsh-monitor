"""
DeepSeek Monitor — 主窗口

- 本地 HTTP 数据服务（127.0.0.1）：/ 提供 UI，/api/data 返回合并后的真实数据
- pywebview 无边框、置顶窗口，右上角定位
- 窗口层启动前先跑单实例检查（launcher.py 调用；此处也兜底一次）

用法：python app.py
"""

import json
import os
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

import webview

from data.parse_usage import aggregate
from data.fetch_balance import fetch_balance
from data.config import CONFIG

ROOT = os.path.dirname(os.path.abspath(__file__))
UI_DIR = os.path.join(ROOT, "ui")
PORT = 18773


def fetch_official_data():
    """运行官网抓取器（node fetch_official.js），返回官方今日数据 dict。

    官方数据是唯一真相源（余额/今日消费/Tokens/请求数）。失败返回 {"ok": False}。
    """
    import subprocess
    import json as _json
    try:
        env = dict(os.environ)
        env.setdefault("NODE_PATH", CONFIG["node_path"])
        r = subprocess.run(
            ["node", os.path.join(ROOT, "fetch_official.js")],
            capture_output=True, text=True, timeout=60, cwd=ROOT, env=env,
            creationflags=subprocess.CREATE_NO_WINDOW,  # 否则无控制台父进程会给 node 弹黑窗口
        )
        out = r.stdout.strip()
        if not out:
            return {"ok": False, "error": "抓取器无输出"}
        return _json.loads(out)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{e.__class__.__name__}: {e}"}


def fetch_glm_data():
    """运行智谱 GLM 财务抓取器（node fetch_glm.js），返回智谱余额/月消费 dict。

    智谱官网无 per-model token 明细（只有余额+月消费），GLM token 用量走本地 jsonl。
    失败返回 {"ok": False}。
    """
    import subprocess
    import json as _json
    try:
        env = dict(os.environ)
        env.setdefault("NODE_PATH", CONFIG["node_path"])
        r = subprocess.run(
            ["node", os.path.join(ROOT, "fetch_glm.js")],
            capture_output=True, text=True, timeout=60, cwd=ROOT, env=env,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        out = r.stdout.strip()
        if not out:
            return {"ok": False, "error": "抓取器无输出"}
        return _json.loads(out)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{e.__class__.__name__}: {e}"}


def get_merged_data():
    """合并：本地用量聚合 + 官网官方数据（余额/今日消费/Tokens）。官方抓不到时余额回退 API。"""
    merged = {}
    try:
        merged = aggregate()
    except Exception as e:  # noqa: BLE001
        merged = {"error_usage": f"{e.__class__.__name__}: {e}"}

    official = fetch_official_data()
    merged["official"] = official

    # 智谱 GLM 财务数据（余额/月消费；独立于 DeepSeek）
    merged["glm"] = fetch_glm_data()

    if official.get("ok"):
        # 官方数据可用：balance 也用官方余额
        if official.get("balance"):
            merged["balance"] = {
                "is_available": True, "currency": "CNY",
                "total_balance": official["balance"],
                "granted_balance": None, "topped_up_balance": None,
            }
    else:
        # 官方抓不到：余额回退 DeepSeek API
        try:
            merged["balance"] = fetch_balance()
        except Exception as e:  # noqa: BLE001
            merged["balance"] = {"error": f"{e.__class__.__name__}: {e}"}

    # 预警阈值（config.json 可覆盖）
    merged["alerts"] = {
        "balance_threshold": float(CONFIG.get("balance_alert_threshold") or 20),
        "today_cost_threshold": float(CONFIG.get("today_cost_alert_threshold") or 50),
    }
    return merged


class DataHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=UI_DIR, **kwargs)

    def log_message(self, *args):  # 静默日志
        pass

    def do_GET(self):
        if self.path == "/api/data":
            try:
                body = json.dumps(get_merged_data(), ensure_ascii=False).encode("utf-8")
            except Exception as e:  # noqa: BLE001
                body = json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


class Api:
    def close(self):
        for w in webview.windows:
            w.destroy()
        # 数据服务由 daemon 线程承载，进程退出即结束

    def minimize(self):
        for w in webview.windows:
            w.minimize()


def screen_size():
    try:
        import ctypes
        user32 = ctypes.windll.user32
        return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
    except Exception:  # noqa: BLE001
        return 1440, 960


_LOCK_FILE = None  # 模块级持有，进程结束前保持锁


def single_instance():
    """msvcrt 文件字节锁实现单实例（stdlib、OS 级保证、进程退出自动释放）。

    实测：本机 Windows 允许同一端口重复绑定，端口守卫不可靠；pywin32 互斥锁的
    GetLastError 又被 Python 调用链清掉。文件锁是最稳妥的方案。
    """
    global _LOCK_FILE
    import msvcrt
    import tempfile
    lock_path = os.path.join(tempfile.gettempdir(), "dsmonitor.lock")
    try:
        f = open(lock_path, "a+")
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return False  # 锁被另一实例持有
    _LOCK_FILE = f  # 持有文件引用 → 锁保持到进程退出
    return True


def main():
    if not single_instance():
        print("DeepSeek Monitor 已在运行，跳过。", file=sys.stderr)
        return
    # 本地数据服务
    server = HTTPServer(("127.0.0.1", PORT), DataHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    # 窗口尺寸与右上角定位
    W, H = 342, 690
    sw, sh = screen_size()
    x = sw - W - 24
    y = 60

    # 只允许标题栏拖动（否则 easy_drag 下点按钮也被当成拖窗，窗口乱跳、按钮失灵）
    webview.settings["DRAG_REGION_DIRECT_TARGET_ONLY"] = True
    webview.create_window(
        "DeepSeek Monitor",
        f"http://127.0.0.1:{PORT}/",
        width=W,
        height=H,
        x=x,
        y=y,
        frameless=True,
        easy_drag=True,
        on_top=True,
        js_api=Api(),
        background_color="#F0F5F9",
    )
    webview.start()


if __name__ == "__main__":
    main()
