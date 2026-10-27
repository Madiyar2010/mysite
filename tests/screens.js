// Скриншоты экранов без игры: главный, магазин (все вкладки), задания дня, рекорды семьи.
// node tests/screens.js  (нужен локальный сервер, как для smoke.js)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.env.URL || 'http://localhost:8765/';
const OUT = process.env.OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, vp, mob] of [['iphone', { width: 844, height: 390 }, true], ['pc', { width: 1280, height: 800 }, false]]) {
    const c = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await c.addInitScript(() => { try {
      localStorage.setItem('ha_a2hs', 'true'); localStorage.setItem('ha_name', '"Тест"'); localStorage.setItem('ha_coins', '500');
      localStorage.setItem('ha_owned', '["none","chick","school","steps","gold"]'); localStorage.setItem('ha_pet', '"chick"'); localStorage.setItem('ha_pack', '"school"'); localStorage.setItem('ha_trail', '"steps"'); localStorage.setItem('ha_skin', '"gold"'); localStorage.setItem('ha_dance', '"flip"');
      localStorage.setItem('ha_family', JSON.stringify({ a1: { name: 'Мама', color: '#ff6b78', week: '', weekWins: 3, wins: 12, games: 30, endless: { 1: 9 }, t: 1 } }));
    } catch (e) { } });
    const p = await c.newPage();
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(name + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(URL);
    await p.waitForSelector('#load.done', { state: 'attached', timeout: 120000 });
    await p.waitForTimeout(800);
    const shot = n => p.screenshot({ path: path.join(OUT, `screens_${n}_${name}.png`) });
    await shot('home');
    await p.click('.tile[data-act=daily]'); await p.waitForTimeout(400); await shot('daily'); await p.click('#m-daily [data-close]');
    await p.click('.tile[data-act=family]'); await p.waitForTimeout(400); await shot('family'); await p.click('#m-family [data-close]');
    await p.click('.tile[data-act=fitting]'); await p.waitForTimeout(600);
    for (const tab of ['hats', 'pets', 'packs', 'trails', 'skins', 'dances']) { await p.click(`#shop-tabs [data-tab=${tab}]`); await p.waitForTimeout(700); await shot('shop_' + tab); }
    await p.mouse.move(300, vp.height / 2); await p.mouse.down(); await p.mouse.move(380, vp.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); await shot('shop_rotated');
    await c.close();
  }
  await b.close();
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'OK, ошибок нет', '→ скриншоты в', OUT);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('СБОЙ', e.message); process.exit(1); });
