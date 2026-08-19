"""
DeepSeek V4 API 价目 —— 用于费用折算（元/百万 token）

来源（2026-08-17 已核实）：
- 官方定价页 https://api-docs.deepseek.com/quick_start/pricing （USD 价 + 峰谷时段）
- 中文新闻多源互证 CNY 价（腾讯新闻/搜狐/凤凰/钛媒体等，2026-08-17 调价生效）

注意：DeepSeek V4 系列于 **2026-08-17 00:00 北京时间** 调价，取消统一计费、改为峰谷分级计价。
因此费用必须按消息时间戳分段：
- 08-17 00:00 北京时间（= 08-16 16:00 UTC）之前 → 旧统一价
- 之后 → 新峰谷价（北京时间 9-12 点、14-18 点为高峰，其余空闲）

价格换算互证：官方 USD 价 ÷ 7.1 ≈ 新闻 CNY 价（如 flash 空闲未命中 $0.22 ÷ 7.1 ≈ ¥1.5）。
"""

from datetime import datetime, timezone

# 计价变更边界：2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC
PRICE_CHANGE_UTC = datetime(2026, 8, 16, 16, 0, 0, tzinfo=timezone.utc)

# 旧统一价（元/百万 token），2026-08-17 北京时间前生效
OLD_PRICES_CNY = {
    "deepseek-v4-flash": {"hit": 0.02, "miss": 1.0, "output": 2.0},
    "deepseek-v4-pro": {"hit": 0.025, "miss": 3.0, "output": 6.0},
}

# 新峰谷价（元/百万 token）
NEW_PRICES_CNY = {
    "deepseek-v4-flash": {
        "off_peak": {"hit": 0.05, "miss": 1.5, "output": 4.5},
        "peak": {"hit": 0.10, "miss": 3.0, "output": 9.0},
    },
    "deepseek-v4-pro": {
        "off_peak": {"hit": 0.15, "miss": 4.5, "output": 13.5},
        "peak": {"hit": 0.30, "miss": 9.0, "output": 27.0},
    },
}

# 高峰时段（北京时间）：09:00-12:00 与 14:00-18:00
PEAK_RANGES_BEIJING = [(9, 12), (14, 18)]


def _is_peak_beijing(dt_utc: datetime) -> bool:
    """按北京时间判断是否高峰时段。"""
    # UTC -> 北京时间 (+8h)
    bj_hour = (dt_utc.astimezone(timezone.utc).hour + 8) % 24
    for start, end in PEAK_RANGES_BEIJING:
        if start <= bj_hour < end:
            return True
    return False


def price_for(model: str, ts_utc: datetime):
    """
    返回某条消息适用的单价三元组 (hit, miss, output)，单位元/百万 token。
    model: deepseek-v4-flash / deepseek-v4-pro
    ts_utc: 带时区的 UTC datetime
    """
    model = model.lower()
    if model not in OLD_PRICES_CNY and model not in NEW_PRICES_CNY:
        # 未知模型（如 qwen3.7-plus 或 synthetic）无价目，返回 None 表示不折算费用
        return None

    if ts_utc < PRICE_CHANGE_UTC:
        p = OLD_PRICES_CNY.get(model)
        if not p:
            return None
        return (p["hit"], p["miss"], p["output"])
    else:
        p = NEW_PRICES_CNY.get(model)
        if not p:
            return None
        tier = p["peak"] if _is_peak_beijing(ts_utc) else p["off_peak"]
        return (tier["hit"], tier["miss"], tier["output"])
