"""
DeepSeek Monitor — 触发入口

由 Claude Code SessionStart hook / dsh ps1 调用。
以分离进程方式启动 app.py，自身立即退出（保证 hook 不阻塞终端）。

单实例由 app.py 内的 msvcrt 文件锁保证；本脚本先检查锁，已在运行则明确提示。
"""

import os
import subprocess
import sys


def app_running():
    """检查是否有实例在运行：dsmonitor.lock 被持有即为运行中。"""
    import msvcrt
    import tempfile
    lock_path = os.path.join(tempfile.gettempdir(), "dsmonitor.lock")
    try:
        f = open(lock_path, "a+")
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        f.close()  # 释放，让 app.py 自己拿
        return False
    except OSError:
        return True


def main():
    if app_running():
        print("DeepSeek Monitor 已在运行（窗口应该已经打开）。")
        print("如需重开，先关闭现有窗口再运行本脚本。")
        return

    root = os.path.dirname(os.path.abspath(__file__))
    app_path = os.path.join(root, "app.py")

    # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP：与调用终端脱离，独立运行
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    subprocess.Popen(
        [sys.executable, app_path],
        creationflags=flags,
        close_fds=True,
        cwd=root,
    )
    print("DeepSeek Monitor 已启动。")


if __name__ == "__main__":
    main()
