// Геймпад (Xbox, PlayStation и похожие): читаем кнопки и стики каждый кадр.
// Кнопки по стандартной раскладке браузера: 0 A/крест, 1 B/круг, 2 X/квадрат, 3 Y/треугольник,
// 4 LB, 5 RB, 6 LT, 7 RT, 8 Назад, 9 Старт, 12-15 крестовина.
export const Pad = {
  connected: false, lx: 0, ly: 0, rx: 0, ry: 0, btn: [], prev: [],
  // нажали только что (срабатывает один раз)
  hit(i) { return !!this.btn[i] && !this.prev[i]; },
  up(i) { return !this.btn[i] && !!this.prev[i]; },
  held(i) { return !!this.btn[i]; },
  poll() {
    this.prev = this.btn;
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const g = list.find(x => x.mapping === 'standard') || list[0];
    if (!g) { if (this.connected) { this.connected = false; this.btn = []; this.lx = this.ly = this.rx = this.ry = 0; } return; }
    this.connected = true;
    const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
    this.lx = dz(g.axes[0] || 0); this.ly = dz(g.axes[1] || 0); this.rx = dz(g.axes[2] || 0); this.ry = dz(g.axes[3] || 0);
    this.btn = g.buttons.map(b => b.pressed || b.value > 0.5);
  }
};
addEventListener('gamepadconnected', () => { Pad.connected = true; document.body.classList.add('pad'); window.__toast && window.__toast('Геймпад подключён! Им можно играть в шутер и «Найди предателя»', 4000); });
addEventListener('gamepaddisconnected', () => { Pad.poll(); if (!Pad.connected) document.body.classList.remove('pad'); });
(function loop() { requestAnimationFrame(loop); if (Pad.connected || navigator.getGamepads) try { Pad.poll(); } catch (e) { } })();
