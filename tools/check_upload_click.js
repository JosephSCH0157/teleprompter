const puppeteer = require('puppeteer');
(async ()=>{
  // start local static server so the page is reachable
  try { require('./static_server.js'); } catch {}
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8080/teleprompter_pro.html', { waitUntil: 'networkidle2' });
  // Ensure static server is started in-page if necessary
  // Patch file input click to record invocation
  const res = await page.evaluate(() => {
    const btn = document.getElementById('uploadFileBtn');
    const inp = document.getElementById('uploadFile');
    if (!btn || !inp) return { ok: false, reason: 'missing elements' };
    let clicked = false;
    const orig = inp.click;
    inp.click = function () { clicked = true; return orig.call(this); };
    // click the visible button
    try { btn.click(); } catch (e) { return { ok: false, reason: 'btn.click threw', e: String(e) }; }
    return { ok: Boolean(clicked) };
  });
  console.log('CHECK_UPLOAD_CLICK', res);
  await browser.close();
  process.exit(res.ok ? 0 : 2);
})();
