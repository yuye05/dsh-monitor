/*
 * 回归测试：官方用量文本解析
 *
 * 用法：node tests/parse_official.test.js
 *
 * FIXTURE 是 2026-09-11 从 platform.deepseek.com/usage 模型视图实际抓下来的 body.innerText
 * （原样保真，含官网页头两条公告横幅与全部图表刻度标签）。它固化了两件事：
 *   1) 当日真实数字：deepseek-flash 请求 1,181 / Tokens 358,383,608；deepseek-v4-pro 请求 32 / Tokens 8,496,891
 *   2) 页面结构：模型名 → 折线图 → 请求次数 → 折线图 → Tokens → 折线图 → 下一个模型名
 *
 * 历史事故：解析器曾把模型名写死为 deepseek-v4-flash-vision-exp，
 * 2026-09-10 官方改名 deepseek-flash 后静默解析失败（官方 per-model 只剩 pro，
 * 浮窗卡片显示"今日未使用"）。本测试正是那次事故的防回归闸门。
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { extractModels } = require(path.join(__dirname, '..', 'lib', 'parse_official.js'));

// 官网页头总量，用于交叉校验 per-model 之和
const PAGE_TOTAL_REQUESTS = 1213;
const PAGE_TOTAL_TOKENS = 366880499;

const FIXTURE = `DeepSeek-V4.1-Flash 发布，文本与 Agent 性能全面提升、兼具原生多模态视觉理解能力，能力更强、速度更快、且成本更低，欢迎测试和反馈。
点击查看详情。
用量信息
API keys
充值
账单
接口文档
帮助与反馈
产品定价
网页版免费对话
yu夜
用量信息
所有日期均按 GMT+8 时间显示，数据可能有 5 分钟延迟。

我们将于北京时间 2026 年 9 月 10 日 12:00 起，调整 flash 系列定价：空闲时段输入缓存命中单价 0.02 元、输入缓存未命中单价 1 元，输出单价 4 元；高峰时段价格为空闲时段价格的 2 倍。请合理安排您的使用。

知道了

DeepSeek 计划于北京时间2026年9月14日12:00下线V4 Pro服务，届时DeepSeek V4 Pro将会路由到V4.1 Flash并按V4.1 Flash计费。经内部、外部多方测试，V4.1 Flash 在性能、费用、速度、总用时等各项指标上已全面超越 V4 Pro。如您在 V4 Pro 和 V4.1 Flash 的对比测试中发现任何问题，请及时向我们反馈，感谢您的支持！

知道了
充值余额
余额预警已开启 
去设置
¥53.33
CNY
去充值
累计消费金额
¥416.66
CNY
时间维度
今天
API Key
全部
清除筛选条件
导出
消费金额
¥28.81
CNY
API 请求次数
1,213
Tokens
366,880,499
消费金额（CNY）
¥28.81
模型
API Key
0
4.5
9
00:00
08:00
15:00
23:00
deepseek-flash
API 请求次数
1,181
0
140
280
00:00
08:00
15:00
23:00
Tokens
358,383,608
0
50M
100M
00:00
08:00
15:00
23:00
deepseek-v4-pro
API 请求次数
32
0
14
28
00:00
08:00
15:00
23:00
Tokens
8,496,891
0
2.5M
5M
00:00
08:00
15:00
23:00`;

let passed = 0;
const failures = [];
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + label);
  } catch (e) {
    failures.push(label + ' -> ' + e.message);
    console.log('  FAIL  ' + label + '\n        ' + e.message);
  }
}

console.log('官方用量文本解析 — 回归测试');
console.log('fixture 长度: ' + FIXTURE.length + ' 字符\n');

const m = extractModels(FIXTURE, ['deepseek-flash', 'deepseek-v4-pro']);

check('解析出改名后的 deepseek-flash（历史事故点）', () => {
  assert.ok(m['deepseek-flash'], 'deepseek-flash 未被解析出来');
  assert.strictEqual(m['deepseek-flash'].tokens, 358383608);
  assert.strictEqual(m['deepseek-flash'].requests, 1181);
});

check('解析出 deepseek-v4-pro', () => {
  assert.ok(m['deepseek-v4-pro'], 'deepseek-v4-pro 未被解析出来');
  assert.strictEqual(m['deepseek-v4-pro'].tokens, 8496891);
  assert.strictEqual(m['deepseek-v4-pro'].requests, 32);
});

check('不会把页头总量 / 图表刻度误判为模型名', () => {
  const names = Object.keys(m).sort();
  assert.deepStrictEqual(
    names,
    ['deepseek-flash', 'deepseek-v4-pro'],
    '模型名集合不符，多出或缺少: ' + JSON.stringify(names)
  );
});

check('per-model 请求数之和 == 页头总请求数', () => {
  const sum = Object.values(m).reduce((s, v) => s + (v.requests || 0), 0);
  assert.strictEqual(sum, PAGE_TOTAL_REQUESTS, '请求数之和不等于 ' + PAGE_TOTAL_REQUESTS + '（实际 ' + sum + '）');
});

check('per-model Tokens 之和 == 页头总 Tokens', () => {
  const sum = Object.values(m).reduce((s, v) => s + (v.tokens || 0), 0);
  assert.strictEqual(sum, PAGE_TOTAL_TOKENS, 'Tokens 之和不等于 ' + PAGE_TOTAL_TOKENS + '（实际 ' + sum + '）');
});

check('优先模型名缺失时补空壳而非 undefined', () => {
  const r = extractModels('deepseek-flash\n请求次数\n1\nTokens\n2\n', ['deepseek-flash', 'deepseek-v4-pro']);
  assert.ok(r['deepseek-v4-pro'], '优先模型名未补空壳');
  assert.strictEqual(r['deepseek-v4-pro'].tokens, null);
  assert.strictEqual(r['deepseek-v4-pro'].requests, null);
});

check('空文本安全返回', () => {
  assert.deepStrictEqual(extractModels('', ['deepseek-flash']), {
    'deepseek-flash': { label: 'deepseek-flash', requests: null, tokens: null },
  });
  assert.deepStrictEqual(extractModels(null), {});
});

console.log('\n通过 ' + passed + ' / ' + (passed + failures.length));
if (failures.length) {
  console.log('\n失败项:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
