// Автопроверка в браузере: компьютер (хост) + айфон горизонтально (гость).
// Нужен локальный сервер в корне проекта: python3 -m http.server 8765
// Запуск:
//   node tests/smoke.js shooter [режим ffa|tdm|ctf|pve] [карта warehouse|castle|graveyard|street]
//   node tests/smoke.js among [карта station|haunted|underwater]
//   node tests/smoke.js lobby
// TUTOR=1 — показывать обучение. CLICK="селектор;селектор" — нажать кнопки в лобби перед стартом (например, .seg[data-o=endless] button[data-v="1"]). Скриншоты — в папку tests/out (или OUT=папка). Код выхода 1, если на странице были ошибки.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.env.URL || 'http://localhost:8765/';
const OUT = process.env.OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const [kind = 'shooter', a1, a2] = process.argv.slice(2);
const errors = [];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = async (name, vp, mobile) => {
    const c = await b.newContext({ viewport: vp, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1 });
    if (!process.env.TUTOR) await c.addInitScript(() => { try { localStorage.setItem('ha_tutor', 'true'); } catch (e) { } });
    const p = await c.newPage(); p.name = name;
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(name + ' console: ' + m.text().slice(0, 200)); });
    p.on('dialog', d => d.accept());
    return p;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${kind}_${n}_${p.name}.png`) });
  const tap = (p, sel) => p.isMobile ? p.tap(sel) : p.click(sel);
  const join = async (p, name, code) => {
    await p.goto(URL + (code ? '?room=' + code + '&debug' : '?debug'));
    await p.fill('#in-name', name);
    await p.waitForSelector('#load.done', { state: 'attached', timeout: 120000 });
    if (code) { await p.click('#btn-join'); } else await p.click('#btn-create');
    await p.waitForSelector('#s-lobby.active', { timeout: 60000 });
  };
  const host = await mk('pc', { width: 1280, height: 800 });
  const phone = await mk('iphone', { width: 844, height: 390 }, true);
  phone.isMobile = true;
  await join(host, 'Папа');
  const code = (await host.textContent('#lb-code')).trim();
  await join(phone, 'Малыш', code);
  const guests = [phone];
  if (kind === 'among') { const tab = await mk('ipad', { width: 1180, height: 820 }, true); tab.isMobile = true; await join(tab, 'Мама', code); guests.push(tab); }
  await host.waitForTimeout(800);
  if (kind === 'lobby') { await shot(host, 'lobby'); await shot(phone, 'lobby'); }
  else {
    if (kind === 'shooter') {
      await host.click(`.mode[data-m=${a1 || 'ffa'}]`); await host.waitForTimeout(300);
      if (a2) { await host.click(`.opt-map[data-smap=${a2}]`); await host.waitForTimeout(300); }
      await host.click('.seg[data-o=bots] button[data-v="2"]').catch(() => { }); await host.waitForTimeout(300);
      if (process.env.CLICK) for (const sel of process.env.CLICK.split(';')) { await host.click(sel).catch(e => errors.push('нет кнопки ' + sel)); await host.waitForTimeout(300); }
    } else {
      await host.click('.mode[data-m=traitor]'); await host.waitForTimeout(300);
      if (a1) { await host.click(`.opt-map[data-map=${a1}]`); await host.waitForTimeout(300); }
    }
    await shot(host, 'lobby'); await shot(phone, 'lobby');
    await host.click('#btn-start');
    const scr = kind === 'shooter' ? '#s-shoot.active' : '#s-among.active';
    for (const p of [host, ...guests]) await p.waitForSelector(scr, { timeout: 90000 });
    await host.waitForTimeout(3000);
    await shot(host, 'start'); await shot(phone, 'start');
    if (kind === 'shooter') {
      await phone.tap('#sh-buy-x').catch(() => { });
      await host.waitForTimeout(12000);
      for (let i = 0; i < 4; i++) { await phone.tap('#sh-fire').catch(() => { }); await phone.waitForTimeout(300); }
      await phone.tap('#sh-reload').catch(() => { }); await phone.waitForTimeout(500); await shot(phone, 'reload');
    } else await host.waitForTimeout(9000);
    await shot(host, 'play'); await shot(phone, 'play');
  }
  await b.close();
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'OK, ошибок нет', '→ скриншоты в', OUT);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('СБОЙ', e.message); process.exit(1); });
