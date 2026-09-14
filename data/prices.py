"""
DeepSeek V4 API 价目 —— 用于费用折算（元/百万 token）

来源（2026-09-11 核实）：官方定价页 https://api-docs.deepseek.com/zh-cn/quick_start/pricing
  原文(1)：「模型名请使用 deepseek-flash。旧模型名 deepseek-v4-flash、
    deepseek-v4-flash-vision-exp 仍可调用，但对应模型已下线，请求将由
    DeepSeek-V4.1-Flash 模型提供服务，并按 Flash 价格计费。」
  原文(3)：「空闲时段价格为高峰时段价格的一半。高峰时段为北京时间
    周一至周五 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）。」

三处计价边界（北京时间）：
- 2026-08-17 00:00：取消统一价，改为峰谷分级计价
- 2026-09-10 12:00：flash 系列降价（空闲 0.02/1/4，高峰为其 2 倍）
- 2026-09-14 12:00：V4 Pro 路由到 V4.1 Flash 并按 Flash 价计费

⚠️ 2026-09-10 模型改名：API 模型 ID 由 deepseek-v4-flash-vision-exp 改为
   deepseek-flash。旧名同样按 Flash 价计费（官方原文(1)），故此处折叠到
   deepseek-flash，不单列价目。
"""

from datetime import datetime, timedelta, timezone

BEIJING_TZ = timezone(timedelta(hours=8))

# 计价变更边界（UTC）
# 2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC
PRICE_CHANGE_UTC = datetime(2026, 8, 16, 16, 0, 0, tzinfo=timezone.utc)
# 2026-09-10 12:00 北京时间 = 2026-09-10 04:00 UTC
FLASH_PRICE_CHANGE_UTC = datetime(2026, 9, 10, 4, 0, 0, tzinfo=timezone.utc)

# 旧统一价（元/百万 token），2026-08-17 北京时间前生效
OLD_PRICES_CNY = {
    "deepseek-flash": {"hit": 0.02, "miss": 1.0, "output": 2.0},
    "deepseek-v4-pro": {"hit": 0.025, "miss": 3.0, "output": 6.0},
}

# 2026-08-17 起峰谷价（元/百万 token）
NEW_PRICES_CNY = {
    "deepseek-flash": {
        "off_peak": {"hit": 0.05, "miss": 1.5, "output": 4.5},
        "peak": {"hit": 0.10, "miss": 3.0, "output": 9.0},
    },
    "deepseek-v4-pro": {
        "off_peak": {"hit": 0.15, "miss": 4.5, "output": 13.5},
        "peak": {"hit": 0.30, "miss": 9.0, "output": 27.0},
    },
}

# 2026-09-10 12:00 起 flash 系列降价（官方现价，元/百万 token）
FLASH_PRICES_CNY = {
    "off_peak": {"hit": 0.02, "miss": 1.0, "output": 4.0},
    "peak": {"hit": 0.04, "miss": 2.0, "output": 8.0},
}

# 固定价（元/百万 token），无峰谷、无新旧之分 —— 目前仅 GLM-5.3-flash
# 来源（2026-08-27 核实）：智谱官方中国区定价，输入 0.8 / 输出 2.8 / 缓存命中 0.23
FLAT_PRICES_CNY = {
    "glm-5.3-flash": {"hit": 0.23, "miss": 0.8, "output": 2.8},
}

# 高峰时段（北京时间，官方原文(3)：仅周一至周五）：09:00-12:00 与 14:00-18:00
PEAK_RANGES_BEIJING = [(9, 12), (14, 18)]

# 模型名别名 → 规范名。2026-09-10 官方改名，旧名请求由 V4.1-Flash 提供服务。
MODEL_ALIASES = {
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-flash": "deepseek-flash",
}


def normalize_model(model):
    """把 API 模型名折叠成规范名（处理 2026-09-10 的 flash 系列改名）。"""
    m = (model or "").lower()
    return MODEL_ALIASES.get(m, m)


def _is_peak(dt_utc):
    """高峰时段 = 北京时间周一至周五的 9-12、14-18 点（官方定价页原文(3)）。

    注意：早期版本只判小时不判星期，会把周末的 9-12/14-18 点误按高峰价计费。
    """
    bj = dt_utc.astimezone(BEIJING_TZ)
    if bj.weekday() >= 5:  # 5=周六 6=周日：全天空闲
        return False
    for start, end in PEAK_RANGES_BEIJING:
        if start <= bj.hour < end:
            return True
    return False


def price_for(model, ts_utc):
    """
    返回某条消息适用的单价三元组 (hit, miss, output)，单位元/百万 token。
    model:  deepseek-flash（含旧名别名）/ deepseek-v4-pro / glm-5.3-flash
    ts_utc: 带时区的 datetime
    """
    model = normalize_model(model)

    # 固定价模型（如 GLM）不分峰谷、不分新旧，直接返回
    flat = FLAT_PRICES_CNY.get(model)
    if flat:
        return (flat["hit"], flat["miss"], flat["output"])

    if model not in OLD_PRICES_CNY and model not in NEW_PRICES_CNY:
        # 未知模型无价目，返回 None 表示不折算费用
        return None

    if ts_utc < PRICE_CHANGE_UTC:
        p = OLD_PRICES_CNY[model]
        return (p["hit"], p["miss"], p["output"])

    # 2026-09-10 12:00 起 flash 系列改用降价后的价目
    if model == "deepseek-flash" and ts_utc >= FLASH_PRICE_CHANGE_UTC:
        tier = FLASH_PRICES_CNY["peak"] if _is_peak(ts_utc) else FLASH_PRICES_CNY["off_peak"]
        return (tier["hit"], tier["miss"], tier["output"])

    p = NEW_PRICES_CNY[model]
    tier = p["peak"] if _is_peak(ts_utc) else p["off_peak"]
    return (tier["hit"], tier["miss"], tier["output"])
