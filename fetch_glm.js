/*
 * DeepSeek Monitor — 智谱 GLM 财务抓取器
 *
 * 用 Playwright + 独立的智谱登录态 .glm-profile 打开 https://open.bigmodel.cn/finance-center/finance/overview，
 * 读取智谱余额（当前/可用余额）与本月总消费。智谱官网没有 DeepSeek 那种"今日 tokens/请求/per-model"明细，
 * 故 GLM 的 token 用量走本地 jsonl（parse_usage），这里只补余额 + 月消费。
 *
 * 首次登录：node fetch_glm.js --login（弹窗手机号+验证码登录一次，会话存 .glm-profile/）
 *
 * 用法：node fetch_glm.js
 * 输出 JSON：
 *   {"ok":true,"balance":"29.76","month_cost":"0.23","recharged_total":"30"}
 *   {"ok":false,"need_login":true}
 */
const { chromium } = require('@playwright/test');
const path = require('path');

const PROFILE = path.join(__dirname, '.glm-profile');
const URL = 'https://open.bigmodel.cn/finance-center/finance/overview';
const LOGIN_WAIT_MS = 5 * 60 * 1000;

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: 'msedge',
      headless: !process.argv.includes('--login'),   // 正常静默；--login 时弹窗供登录
      viewport: { width: 1280, height: 900 },
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 等登录（若被重定向到 login）
    const start = Date.now();
    let told = false;
    while (page.url().includes('/login') || page.url().includes('/sign_in')) {
      if (!told) {
        if (process.argv.includes('--login')) {
          console.error('请在弹出的 Edge 窗口登录智谱（手机号+验证码），登录成功后自动继续……');
        } else {
          console.error('未登录：请运行  node fetch_glm.js --login  弹窗登录一次');
        }
        told = true;
      }
      if (Date.now() - start > LOGIN_WAIT_MS) { console.log(JSON.stringify({ ok: false, need_login: true })); await ctx.close(); return; }
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(4500);

    const text = await page.evaluate(() => document.body.innerText);
    const clean = (s) => (s || '').replace(/[¥￥,]/g, '').trim();

    // 余额：页面布局把 '当前余额/余额预警已开启/设置/充值明细' 挤在同一值前
    // 实测：...当前余额余额预警已开启\n设置\n充值明细\n29.76元\n可用余额...
    // 抓第一个出现在 '当前余额' 之后的 "XX元" 数值
    const balM = text.match(/当前余额[\s\S]{0,80}?(\d+\.\d+)元/);
    const balance = balM ? clean(balM[1]) : null;

    // 累计充值
    const rechM = text.match(/累计充值\n(\d+(?:\.\d+)?)元/);
    const recharged = rechM ? clean(rechM[1]) : null;

    // 本月总消费金额：列头顺序 目录总价→总消费金额→...，值行第一个数是目录总价，第二个是总消费金额
    // 实测值行：\n0.25095712\n￥0.23003816\n￥0\n...
    const costM = text.match(/月账单概览[\s\S]*?\n\s*\n([\d.]+)\n\s*\n[￥¥]([\d.]+)/);
    const monthCost = costM ? clean(costM[2]) : null;

    console.log(JSON.stringify({
      ok: true,
      balance: balance,
      recharged_total: recharged,
      month_cost: monthCost,
    }, null, 2));
    await ctx.close();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    if (ctx) await ctx.close().catch(() => {});
  }
})();
