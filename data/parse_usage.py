"""
DeepSeek Monitor — 用量聚合脚本

从 Claude Code 会话 jsonl（唯一可靠数据源）按 (model, 北京时间日期) 聚合 token 用量，
并调用 prices.py 按消息时间戳折算费用（08-17 前旧统一价 / 之后峰谷价）。

输出 JSON 结构（供 ui/app.js 消费）：
{
  "generated_at": iso,
  "models": {
    "deepseek-v4-flash": {label, input_tokens, cache_read_tokens, cache_creation_tokens,
                          output_tokens, total_tokens, cache_hit_rate, cost_cny,
                          efficiency_mtok_per_yuan},
    "deepseek-v4-pro": {...},
    "<其他模型>": {...}
  },
  "daily": [ {date:"MM-DD", hit_tokens, miss_tokens, output_tokens}, x7 ],
  "summary": {today_cost, today_date, month_cost, month}
}
"""

import json
import glob
import os
from datetime import datetime, timedelta, timezone

try:
    from data.prices import price_for      # 包式导入（Pylance 可解析）
except ImportError:
    from prices import price_for           # 独立运行脚本时的回退

try:
    from data.config import CONFIG as _C
except ImportError:
    from config import CONFIG as _C

# 本项目 Claude Code 会话目录（可在 config.json 覆盖）
CLAUDE_PROJECTS = _C["claude_projects"]
BEIJING_TZ = timezone(timedelta(hours=8))

# 主展示的模型（flash 保留历史数据；vision 为新主力）
PRIMARY_MODELS = ["deepseek-v4-flash-vision-exp", "deepseek-v4-flash", "deepseek-v4-pro"]
LABELS = {
    "deepseek-v4-flash-vision-exp": "V4 Flash Vision",
    "deepseek-v4-flash": "V4 Flash",
    "deepseek-v4-pro": "V4 Pro",
}


def parse_ts(ts_str):
    """ISO 时间串 -> 带时区 datetime；失败返回 None。"""
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except Exception:
        return None


def bj_date_str(ts_utc):
    """UTC datetime -> 北京时间日期 YYYY-MM-DD。"""
    return ts_utc.astimezone(BEIJING_TZ).strftime("%Y-%m-%d")


def cost_cny(model, ts_utc, hit, miss, creation, output):
    """按消息时间戳 + 单价折算费用（元）。单价为每百万 token。"""
    p = price_for(model, ts_utc)
    if p is None:
        return 0.0
    hit_p, miss_p, out_p = p
    return (miss / 1e6) * miss_p + ((hit + creation) / 1e6) * hit_p + (output / 1e6) * out_p


def aggregate():
    per_model = {}   # model -> dict(终身累计)
    per_model_today = {}   # model -> dict(今日累计，主卡片展示)
    per_day = {}     # "YYYY-MM-DD" -> dict(hit/miss/out/cost)
    today_bj = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    month_prefix = today_bj[:7]  # "YYYY-MM"
    month_cost = 0.0
    today_cost = 0.0

    files = glob.glob(os.path.join(CLAUDE_PROJECTS, "**", "*.jsonl"), recursive=True)
    total_msgs = 0

    for fp in files:
        try:
            f = open(fp, encoding="utf-8")
        except OSError:
            continue
        with f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if obj.get("type") != "assistant":
                    continue
                msg = obj.get("message") or {}
                usage = msg.get("usage")
                if not usage:
                    continue
                model = msg.get("model")
                if not model:
                    continue
                ts = parse_ts(obj.get("timestamp"))
                if ts is None:
                    continue

                total_msgs += 1
                i_tok = int(usage.get("input_tokens") or 0)
                cr_tok = int(usage.get("cache_read_input_tokens") or 0)
                cc_tok = int(usage.get("cache_creation_input_tokens") or 0)
                o_tok = int(usage.get("output_tokens") or 0)

                c = cost_cny(model, ts, cr_tok, i_tok, cc_tok, o_tok)

                # 模型级聚合（终身累计）
                m = per_model.setdefault(model, {
                    "input_tokens": 0, "cache_read_tokens": 0,
                    "cache_creation_tokens": 0, "output_tokens": 0, "cost_cny": 0.0,
                })
                m["input_tokens"] += i_tok
                m["cache_read_tokens"] += cr_tok
                m["cache_creation_tokens"] += cc_tok
                m["output_tokens"] += o_tok
                m["cost_cny"] += c

                # 按北京时间日期聚合（供 7 天图 + 今日/本月费用）
                d = bj_date_str(ts)
                day = per_day.setdefault(d, {"hit": 0, "miss": 0, "out": 0})
                day["hit"] += cr_tok
                day["miss"] += i_tok
                day["out"] += o_tok
                if d == today_bj:
                    # 今日模型级聚合（主卡片展示当天用量/费用）
                    mt = per_model_today.setdefault(model, {
                        "input_tokens": 0, "cache_read_tokens": 0,
                        "cache_creation_tokens": 0, "output_tokens": 0, "cost_cny": 0.0,
                    })
                    mt["input_tokens"] += i_tok
                    mt["cache_read_tokens"] += cr_tok
                    mt["cache_creation_tokens"] += cc_tok
                    mt["output_tokens"] += o_tok
                    mt["cost_cny"] += c
                    today_cost += c
                if d.startswith(month_prefix):
                    month_cost += c

    # 组装输出：主卡片只留 flash/pro（匹配参考图两张卡片），其余模型单列 other_models
    def _fmt(model, m):
        total = m["input_tokens"] + m["cache_read_tokens"] + m["cache_creation_tokens"] + m["output_tokens"]
        denom = m["input_tokens"] + m["cache_read_tokens"] + m["cache_creation_tokens"]
        hit_rate = (m["cache_read_tokens"] / denom) if denom else 0.0
        eff = (total / 1e6) / m["cost_cny"] if m["cost_cny"] > 0 else 0.0
        return {
            "label": LABELS.get(model, model),
            "input_tokens": m["input_tokens"],
            "cache_read_tokens": m["cache_read_tokens"],
            "cache_creation_tokens": m["cache_creation_tokens"],
            "output_tokens": m["output_tokens"],
            "total_tokens": total,
            "cache_hit_rate": round(hit_rate, 4),
            "cost_cny": round(m["cost_cny"], 2),
            "efficiency_mtok_per_yuan": round(eff, 2),
        }

    models_out = {}
    other_out = {}
    for model, m in per_model.items():
        if model in PRIMARY_MODELS:
            # 主卡片展示"今日"数据，lifetime 嵌套保留（用户要求卡片只显示当天用量）
            today_agg = per_model_today.get(model) or {
                "input_tokens": 0, "cache_read_tokens": 0,
                "cache_creation_tokens": 0, "output_tokens": 0, "cost_cny": 0.0,
            }
            entry = _fmt(model, today_agg)
            entry["lifetime"] = _fmt(model, m)
            models_out[model] = entry
        elif m["input_tokens"] + m["cache_read_tokens"] + m["output_tokens"] > 0:
            other_out[model] = _fmt(model, m)

    # 最近 7 个北京时间日期（含今日）
    today_dt = datetime.now(BEIJING_TZ)
    daily = []
    for i in range(6, -1, -1):
        d = (today_dt - timedelta(days=i)).strftime("%Y-%m-%d")
        day = per_day.get(d, {"hit": 0, "miss": 0, "out": 0})
        daily.append({
            "date": d[5:],  # "MM-DD"
            "hit_tokens": day["hit"],
            "miss_tokens": day["miss"],
            "output_tokens": day["out"],
        })

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_messages": total_msgs,
        "models": models_out,
        "other_models": other_out,
        "daily": daily,
        "summary": {
            "today_cost": round(today_cost, 2),
            "today_date": today_bj[5:],
            "month_cost": round(month_cost, 2),
            "month": month_prefix,
        },
    }
    return out


if __name__ == "__main__":
    result = aggregate()
    print(json.dumps(result, ensure_ascii=False, indent=2))
