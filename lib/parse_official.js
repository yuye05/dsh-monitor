/*
 * 官方用量文本解析（从 fetch_official.js 抽出，便于回归测试）
 *
 * 为什么单独成文件：2026-09-10 DeepSeek 把 V4.1 Flash 的 API 模型 ID
 * 从 deepseek-v4-flash-vision-exp 改成 deepseek-flash，写死模型名的解析器
 * 当场断链（官方 per-model 只剩 pro，卡片显示"今日未使用"）。
 * 因此这里改成通用遍历：不依赖任何写死的模型名，下次改名/上下线自动跟上。
 *
 * 页面结构（模型视图，body.innerText，已由 tests/parse_official.test.js 固化）：
 *   ... 时间维度 / 今天 / API Key / 全部 / 清除筛选条件 / 导出
 *   消费金额 / ¥x / API 请求次数 / <总量> / Tokens / <总量>
 *   消费金额（CNY）/ ¥x / 模型 / API Key      ← 第二个 "API Key" 是图表视图切换，其后才是模型列表
 *   0 / 4.5 / 9 / 00:00 / 08:00 / 15:00 / 23:00     ← 消费金额折线图的刻度标签
 *   deepseek-flash                                  ← 模型名（每个模型只出现一次）
 *   API 请求次数 / <请求数> / <刻度标签...>
 *   Tokens / <Token 数> / <刻度标签...>
 *   deepseek-v4-pro
 *   ...
 */

'use strict';

// 模型标识符：形如 deepseek-flash、deepseek-v4-pro（小写字母/数字/点/连字符）。
// 图表刻度标签（0、4.5、00:00 等）不含连字符，天然不匹配。
const MODEL_TOKEN_RE = /[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+/g;
// 图表视图切换的锚点：模型列表紧随其后，用它排除页头导航/公告里的英文串
const ANCHOR_RE = /API\s*Key/g;

/**
 * 从官网页文本里扫出「模型名 + 请求数 + Tokens」。
 *
 * @param {string} t          官方模型视图的 body.innerText
 * @param {string[]} priority 必须存在的模型名（缺失时补 tokens/requests 为 null 的空壳，
 *                            让上层取值语义明确：键存在但为 null == 官方未列出该模型）
 * @returns {Object} {"<模型名>": {label, tokens, requests}, ...}
 */
function extractModels(t, priority) {
  priority = priority || [];
  const out = {};
  if (!t) return withPriority(out, priority);

  // 锚点：取最后一个 "API Key"（图表视图切换），模型列表在其后；
  // 找不到锚点时退回全文扫描（仍受"必须含连字符"约束，页头公告不会误命中）。
  let from = 0;
  let m;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(t)) !== null) from = m.index + m[0].length;

  const names = [];
  MODEL_TOKEN_RE.lastIndex = from;
  let tok;
  while ((tok = MODEL_TOKEN_RE.exec(t)) !== null) {
    if (!names.includes(tok[0])) names.push(tok[0]);
  }
  if (!names.length) return withPriority(out, priority);

  const firstIdx = names.map((n) => ({ n, i: t.indexOf(n, from) })).sort((a, b) => a.i - b.i);

  for (let k = 0; k < firstIdx.length; k++) {
    const name = firstIdx[k].n;
    const start = firstIdx[k].i;
    const end = k + 1 < firstIdx.length ? firstIdx[k + 1].i : t.length;
    const sec = t.slice(start, end);
    // \s* 兼容换行/回车：官网页文本经不同途径取出时行尾可能是 \r 或 \n
    const rM = sec.match(/请求次数\s*([\d,]+)/);
    const oM = sec.match(/Tokens\s*([\d,]+)/);
    out[name] = {
      label: name,
      requests: rM ? parseInt(rM[1].replace(/,/g, ''), 10) : null,
      tokens: oM ? parseInt(oM[1].replace(/,/g, ''), 10) : null,
    };
  }
  return withPriority(out, priority);
}

function withPriority(out, priority) {
  for (const p of priority) {
    if (!(p in out)) out[p] = { label: p, requests: null, tokens: null };
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractModels };
}
