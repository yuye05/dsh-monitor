/* DeepSeek Monitor — 渲染与交互 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- 格式化 ----------
  function fmtInt(n) {
    return (n || 0).toLocaleString("en-US");
  }

  function fmtMoney(cny) {
    if (cny === null || cny === undefined || isNaN(cny)) return "--";
    return "¥" + Number(cny).toFixed(2);
  }

  // 大数缩写：16123456 -> 16.1M，241468160 -> 241.5M，0 -> 0
  function fmtCompact(n) {
    n = n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }

  function fmtPercent(r) {
    if (r === null || r === undefined || isNaN(r)) return "--";
    return (r * 100).toFixed(0) + "%";
  }

  // 中文大数：202560687 -> 2.03亿，1234567 -> 123.5万
  function fmtCn(n) {
    n = n || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return String(n);
  }

  // ---------- 数据获取 ----------
  async function getData() {
    // 生产走本地 HTTP 服务 /api/data；无服务（纯浏览器预览）回退 sample.json
    let resp;
    try {
      resp = await fetch("/api/data", { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return await resp.json();
    } catch (e) {
      resp = await fetch("sample.json");
      if (!resp.ok) throw new Error("无数据服务且 sample.json 加载失败");
      return await resp.json();
    }
  }

  // ---------- 渲染 ----------
  function renderModel(m, model, offModel) {
    const isFlash = model === "deepseek-v4-flash" || model === "deepseek-v4-flash-vision-exp";
    const cls = isFlash ? "flash" : "pro";
    const icon = model === "deepseek-v4-flash" ? "⚡" : model === "deepseek-v4-flash-vision-exp" ? "👁️" : "\u{1F9E0}"; // ⚡ / 👁️ / 🧠
    if (!m) return "";
    // 主数字：官方 per-model Tokens 优先；本地兜底
    const tokens =
      offModel && offModel.tokens != null
        ? offModel.tokens
        : m.input_tokens + m.output_tokens;
    const requests = offModel && offModel.requests != null ? offModel.requests : null;
    if (tokens === 0) {
      return `
      <section class="card model-card">
        <div class="model-head">
          <span class="model-icon ${cls}">${icon}</span>
          <span class="model-name">${m.label}</span>
          <span class="today-tag">今日</span>
        </div>
        <div class="model-usage zero">今日未使用</div>
      </section>`;
    }
    // 本地有真实用量数据才显示命中率（否则像 Pro 来自 dsh 时本地无数据，0% 会误导）
    const hasLocal = m.input_tokens + m.cache_read_tokens + m.output_tokens > 0;
    const hitBadge = hasLocal
      ? `<span class="model-hit ${cls}">缓存命中 ${fmtPercent(m.cache_hit_rate)}</span>`
      : "";
    return `
      <section class="card model-card">
        <div class="model-head">
          <span class="model-icon ${cls}">${icon}</span>
          <span class="model-name">${m.label}</span>
          <span class="today-tag">今日</span>
          ${hitBadge}
        </div>
        <div class="model-usage">${fmtInt(tokens)} <span style="font-size:11px;color:var(--muted);font-weight:400">Tokens</span></div>
        <div class="model-sub">
          ${requests != null ? `<span>请求 <b>${fmtInt(requests)}</b></span>` : ""}
          <span>来源 <b>官网</b></span>
        </div>
      </section>`;
  }

  function renderChart() {
    const daily = DATA.daily || [];
    const bars = $("chart-bars");
    // 计算每根柱总高度（线性，最小可见高度兜底）
    const totals = daily.map((d) => d.hit_tokens + d.miss_tokens + d.output_tokens);
    const max = Math.max.apply(null, totals) || 1;
    bars.innerHTML = daily
      .map((d, i) => {
        const total = totals[i];
        const h = total > 0 ? Math.max((total / max) * 100, 2) : 0;
        const seg = (v, cls) =>
          v > 0 ? `<div class="bar-seg ${cls}" style="height:${Math.max((v / total) * 100, 1.5)}%"></div>` : "";
        return `
          <div class="bar-col">
            <span class="bar-value">${fmtCompact(total)}</span>
            <div class="bar-stack" style="height:${h}%">
              ${seg(d.output_tokens, "out")}
              ${seg(d.miss_tokens, "miss")}
              ${seg(d.hit_tokens, "hit")}
            </div>
            <span class="bar-date">${d.date}</span>
          </div>`;
      })
      .join("");

    // 汇总：命中率 = 命中/(命中+未命中)，合计 = 7 天总 token
    const sumHit = daily.reduce((s, d) => s + d.hit_tokens, 0);
    const sumMiss = daily.reduce((s, d) => s + d.miss_tokens, 0);
    const sumAll = daily.reduce((s, d) => s + d.hit_tokens + d.miss_tokens + d.output_tokens, 0);
    const rate = sumHit + sumMiss > 0 ? (sumHit / (sumHit + sumMiss)) * 100 : 0;
    $("chart-summary").textContent = `命中率 ${rate.toFixed(0)}% · 合计 ${fmtCompact(sumAll)}`;
  }

  let DATA = null;
  const ALERTED = { balance: false, cost: false };

  // A1: 一次性 toast（role=alert 播报、4s 自动消失）
  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove("show");
    void t.offsetWidth; // 重启过渡动画
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.hidden = true;
      t.classList.remove("show");
    }, 4000);
  }

  function render(data) {
    DATA = data;
    const off = data.official || {};
    const offOk = off && off.ok;
    const s = data.summary || {};
    const bal = data.balance || {};

    // 余额：官方优先，回退 API/本地
    const balanceVal =
      offOk && off.balance != null && !isNaN(Number(off.balance))
        ? Number(off.balance)
        : bal && bal.is_available
        ? Number(bal.total_balance)
        : null;
    if (balanceVal != null) {
      $("balance-value").innerHTML = `<span class="cny">¥</span>${balanceVal.toFixed(2)}`;
    } else {
      $("balance-value").textContent = "--";
    }
    // 当日消耗：官方今日消费优先，回退本地估算
    const todayCost =
      offOk && off.today_cost != null && !isNaN(Number(off.today_cost))
        ? Number(off.today_cost)
        : s.today_cost;
    $("today-cost").textContent = fmtMoney(todayCost);

    // A1: 余额/今日消费预警（阈值来自 /api/data alerts；文字+颜色双通道，不只靠色）
    const alerts = data.alerts || {};
    const balThresh = alerts.balance_threshold;
    const costThresh = alerts.today_cost_threshold;
    if (balThresh && balanceVal != null && balanceVal < balThresh) {
      $("balance-value").classList.add("danger");
      $("balance-chip").classList.add("warn");
      $("balance-chip").innerHTML = '<span class="dot"></span>余额不足';
      if (!ALERTED.balance) {
        ALERTED.balance = true;
        showToast("余额 ¥" + balanceVal.toFixed(2) + " 已低于阈值 ¥" + balThresh);
      }
    } else {
      $("balance-value").classList.remove("danger");
      $("balance-chip").classList.remove("warn");
      $("balance-chip").innerHTML = '<span class="dot"></span>可用';
    }
    const costNum = todayCost != null && !isNaN(todayCost) ? Number(todayCost) : null;
    if (costThresh && costNum != null && costNum > costThresh) {
      $("today-cost").classList.add("danger");
      $("cost-warn").hidden = false;
      if (!ALERTED.cost) {
        ALERTED.cost = true;
        showToast("今日消费 ¥" + costNum.toFixed(2) + " 已超过 ¥" + costThresh);
      }
    } else {
      $("today-cost").classList.remove("danger");
      $("cost-warn").hidden = true;
    }
    // 今日 Tokens：官方
    $("today-tokens").textContent =
      offOk && off.total_tokens != null ? fmtCn(Number(off.total_tokens)) : "--";
    // 模型卡片：官方 per-model Tokens 为主，命中率来自本地
    const offModels = (off && off.models) || {};
    const models = Object.keys(data.models || {}).filter(
      (m) => m === "deepseek-v4-flash" || m === "deepseek-v4-flash-vision-exp" || m === "deepseek-v4-pro"
    );
    const offKeyMap = {
      "deepseek-v4-flash": "flash",
      "deepseek-v4-flash-vision-exp": "flash-vision",
      "deepseek-v4-pro": "pro",
    };
    $("model-cards").innerHTML = models
      .map((m) => {
        return renderModel(data.models[m], m, offModels[offKeyMap[m] || "pro"]);
      })
      .join("");
    // 图表
    renderChart();
    // 页脚
    const parts = [];
    if (offOk && off.requests != null) parts.push(`官方请求 ${fmtInt(Number(off.requests))}`);
    parts.push(offOk ? "数据来源：官网" : "数据来源：本地估算");
    const gen = data.generated_at ? new Date(data.generated_at) : null;
    if (gen) parts.push(`更新于 ${gen.toLocaleString("zh-CN", { hour12: false })}`);
    $("footer").textContent = parts.join(" · ");
  }

  // ---------- 事件 ----------
  let _refreshing = false; // A2: 防止自动刷新与手动刷新并发（抓官网 ~8s）
  async function refresh() {
    if (_refreshing) return;
    _refreshing = true;
    $("btn-refresh").classList.add("spinning");
    try {
      const data = await getData();
      render(data);
    } catch (e) {
      $("balance-value").textContent = "--";
      $("footer").textContent = "加载失败: " + e.message;
    } finally {
      _refreshing = false;
      $("btn-refresh").classList.remove("spinning");
    }
  }

  $("btn-refresh").addEventListener("click", refresh);
  $("btn-minimize").addEventListener("click", () => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.minimize) {
      window.pywebview.api.minimize();
    }
  });
  $("btn-close").addEventListener("click", () => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.close) {
      window.pywebview.api.close();
    }
  });

  // 初始加载
  refresh();

  // A2: 定时自动刷新（每 10 分钟；fetch_official 单实例锁已在 app.py 端保证不重入）
  const AUTO_REFRESH_MS = 10 * 60 * 1000;
  setInterval(refresh, AUTO_REFRESH_MS);
})();
