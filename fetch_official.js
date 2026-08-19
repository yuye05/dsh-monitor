/*
 * DeepSeek Monitor — 官网用量抓取器
 *
 * 用 Playwright + widget 自有的 Edge 配置打开 https://platform.deepseek.com/usage，
 * 把时间维度切成「今天」，读取官方今日数字（余额/今日消费/Tokens/请求数）。
 * 首次会弹窗让你登录一次，登录后会话保存在 .edge-profile/。
 *
 * 用法：node fetch_official.js
 * 输出 JSON：
 *   {"ok":true,"balance":"55.47","today_cost":"20.89","total_tokens":"180123456","requests":"1030","time_range":"今天"}
 *   {"ok":false,"need_login":true}
 */
const { chromium } = require('@playwright/test');
const path = require('path');

const PROFILE = path.join(__dirname, '.edge-profile');
const URL = 'https://platform.deepseek.com/usage';
const LOGIN_WAIT_MS = 5 * 60 * 1000;

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: 'msedge',
      headless: !process.argv.includes('--login'),   // 正常静默；--login 时弹窗供登录
      viewport: { width: 1280, height: 820 },
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 等登录（登录流程自己会跳转，绝不强制刷新）
    const start = Date.now();
    let told = false;
    while (page.url().includes('/sign_in') || page.url().includes('/login')) {
      if (!told) {
        if (process.argv.includes('--login')) {
          console.error('请在弹出的 Edge 窗口登录 DeepSeek 开放平台，登录成功后自动继续……');
        } else {
          console.error('未登录：请运行  node fetch_official.js --login  弹窗登录一次');
        }
        told = true;
      }
      if (Date.now() - start > LOGIN_WAIT_MS) { console.log(JSON.stringify({ ok: false, need_login: true })); await ctx.close(); return; }
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(4000);

    // 把时间维度切成「今天」（若当前不是）
    try {
      const hasRange = await page.evaluate(() => /近\s*\d+\s*天|今天/.test(document.body.innerText));
      if (hasRange) {
        // 点当前时间范围值，展开下拉
        await page.getByText(/近\s*\d+\s*天/).first().click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        // 选「今天」
        await page.getByText('今天', { exact: true }).last().click({ timeout: 5000 });
        await page.waitForTimeout(2500);
      }
    } catch (e) { /* 切不动就按当前值抓 */ }

    await page.screenshot({ path: path.join(__dirname, 'official_page.png') });

    // 切到"模型"视图，抓 per-model 数据（图表右上角有 模型/API Key 切换）
    let model_text = null;
    try {
      const modelBtn = page.getByText('模型', { exact: true });
      if (await modelBtn.count() > 0) {
        await modelBtn.last().click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(__dirname, 'official_models.png') });
        model_text = await page.evaluate(() => document.body.innerText);
      }
    } catch (e) { /* 切不动就跳过 */ }

    const text = await page.evaluate(() => document.body.innerText);
    const clean = (s) => (s || '').replace(/[¥￥,]/g, '').trim();

    // 余额：¥ 在「充值余额」之后若干字符内
    const balM = text.match(/充值余额[\s\S]{0,120}?[¥￥]\s*([\d,.]+)/);
    // 今日消费：排除「累计消费金额」
    const costM = text.match(/(?<!累计)消费金额\s*[¥￥]?\s*([\d,.]+)/);
    const reqM = text.match(/API\s*请求次数\s*[：:]?\s*([\d,]+)/i);
    const tokM = text.match(/Tokens?\s*[：:]?\s*([\d,]{6,})/i);
    const rangeM = text.match(/近\s*\d+\s*天|今天/);

    // 从模型视图解析 per-model Tokens/请求数
    function extractModels(t) {
      const out = {};
      for (const [name, key] of [['deepseek-v4-flash', 'flash'], ['deepseek-v4-pro', 'pro']]) {
        const idx = t.indexOf(name);
        if (idx < 0) continue;
        const sec = t.slice(idx, idx + 300);
        const rM = sec.match(/API\s*请求次数\s*([\d,]+)/);
        const oM = sec.match(/Tokens\s*([\d,]+)/);
        out[key] = {
          label: key === 'flash' ? 'V4 Flash' : 'V4 Pro',
          tokens: oM ? parseInt(oM[1].replace(/,/g, '')) : null,
          requests: rM ? parseInt(rM[1].replace(/,/g, '')) : null,
        };
      }
      return out;
    }

    console.log(JSON.stringify({
      ok: true,
      logged_in: true,
      time_range: rangeM ? rangeM[0].trim() : '?',
      balance: balM ? clean(balM[1]) : null,
      today_cost: costM ? clean(costM[1]) : null,
      total_tokens: tokM ? clean(tokM[1]) : null,
      requests: reqM ? clean(reqM[1]) : null,
      models: extractModels(model_text || text),
    }, null, 2));
    await ctx.close();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    if (ctx) await ctx.close().catch(() => {});
  }
})();
