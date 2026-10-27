// Звуки (Kenney, CC0) и простая фоновая музыка, которая играется синтезатором прямо в браузере.
const FILES = ['click', 'select', 'back', 'confirm', 'error', 'toggle', 'open', 'close', 'tick', 'glitch', 'taskdone', 'step', 'drop', 'pop',
  'door_open', 'door_close', 'vent', 'kill', 'slime', 'lights', 'eject', 'computer', 'ambient', 'boom', 'laser', 'laser2', 'blaster', 'hit', 'explode', 'thud',
  'step0', 'step1', 'step2', 'step3', 'step4', 'j_crew', 'j_impostor', 'j_meeting', 'j_win', 'j_lose', 'j_start', 'j_report'];

const LSget = (k, d) => { try { const v = localStorage.getItem('ha_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const LSset = (k, v) => { try { localStorage.setItem('ha_' + k, JSON.stringify(v)); } catch (e) { } };

export const Sound = {
  ctx: null, buf: {}, sfxGain: null, musicGain: null, master: null,
  sfxVol: LSget('sfxVol', 0.8), musicVol: LSget('musicVol', 0.35), quiet: LSget('quiet', false),
  loops: {}, music: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') try { this.ctx.resume(); } catch (e) { } return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.apply();
      // айфон включает звук только по касанию: проигрываем тишину, чтобы «разбудить» звук
      try { const b = this.ctx.createBuffer(1, 1, 22050), src = this.ctx.createBufferSource(); src.buffer = b; src.connect(this.ctx.destination); src.start(0); } catch (e) { }
      for (const f of FILES) this.load(f);
      if (this.wantMusic) this.playMusic(this.wantMusic);
    } catch (e) { }
  },
  load(name) {
    fetch('assets/sfx/' + name + '.mp3').then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).then(b => { this.buf[name] = b; if (this.pendingLoops[name]) this.loop(name, this.pendingLoops[name]); }).catch(() => { });
  },
  pendingLoops: {},
  apply() {
    if (!this.ctx) return;
    const q = this.quiet ? 0.25 : 1;
    this.sfxGain.gain.value = this.sfxVol * q;
    this.musicGain.gain.value = this.musicVol * q;
  },
  set(k, v) { this[k] = v; LSset(k, v); this.apply(); },
  play(name, opts = {}) {
    if (!this.ctx || !this.buf[name]) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[name];
    s.playbackRate.value = opts.rate || (opts.vary ? 0.9 + Math.random() * 0.2 : 1);
    const g = this.ctx.createGain(); g.gain.value = opts.vol ?? 1;
    let node = g;
    if (opts.muffle) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.muffle; node.connect(f); node = f; }
    if (opts.pan != null && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); node.connect(p); node = p; }
    s.connect(g); node.connect(this.sfxGain);
    s.start();
    return s;
  },
  // звук в мире: громкость зависит от расстояния до слушателя
  // сторона: right — куда смотрит правое ухо слушателя (по умолчанию вправо по экрану), сзади звук глуше
  at(name, dx, dz, maxD = 16, opts = {}) {
    const d = Math.hypot(dx, dz); if (d > maxD) return;
    const r = opts.right || { x: 1, z: 0 }, k = d > 0.5 ? 1 : d / 0.5;
    const side = d > 0.01 ? (dx * r.x + dz * r.z) / d : 0;
    const front = opts.right && d > 0.01 ? (dx * r.z - dz * r.x) / d : 1; // направление взгляда получается из «правого уха»
    this.play(name, { ...opts, vol: (opts.vol ?? 1) * (1 - d / maxD) ** 1.3 * (front < -0.3 ? 0.8 : 1), pan: side * 0.95 * k, muffle: front < -0.3 ? 1600 : 0 });
  },
  loop(name, vol = 1) {
    if (!this.ctx) return;
    if (!this.buf[name]) { this.pendingLoops[name] = vol; return; }
    delete this.pendingLoops[name];
    if (this.loops[name]) { this.loops[name].g.gain.value = vol; return; }
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[name]; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.sfxGain); s.start();
    this.loops[name] = { s, g };
  },
  stopLoop(name) { delete this.pendingLoops[name]; const l = this.loops[name]; if (l) { try { l.s.stop(); } catch (e) { } delete this.loops[name]; } },
  stopLoops() { for (const k of Object.keys(this.loops)) this.stopLoop(k); this.pendingLoops = {}; },
  // ---------- сирена саботажа ----------
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNode) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 600; lfo.frequency.value = 1.2; lg.gain.value = 220;
      lfo.connect(lg); lg.connect(o.frequency); g.gain.value = 0.06; o.connect(g); g.connect(this.sfxGain); o.start(); lfo.start();
      this.sirenNode = { o, lfo };
    } else if (!on && this.sirenNode) { try { this.sirenNode.o.stop(); this.sirenNode.lfo.stop(); } catch (e) { } this.sirenNode = null; }
  },
  // ---------- музыка ----------
  playMusic(kind) {
    this.wantMusic = kind;
    if (!this.ctx) return;
    if (this.music && this.music.kind === kind) return;
    this.stopMusic();
    const ctx = this.ctx, out = this.musicGain;
    const chords = kind === 'menu' ? [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] : [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 43, 47]];
    const bpm = kind === 'menu' ? 92 : 70, beat = 60 / bpm;
    const freq = n => 440 * Math.pow(2, (n - 69) / 12);
    const state = { kind, stop: false, next: ctx.currentTime + 0.1, step: 0 };
    const note = (f, t, d, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    };
    const sched = () => {
      if (state.stop) return;
      while (state.next < ctx.currentTime + 0.4) {
        const t = state.next, s = state.step, ch = chords[Math.floor(s / 8) % chords.length];
        if (s % 8 === 0) ch.forEach(n => note(freq(n), t, beat * 7.5, 'triangle', 0.05));
        if (s % 2 === 0) note(freq(ch[0] - 12), t, beat * 1.6, 'sine', 0.09);
        if (kind === 'menu' && Math.random() < 0.55) note(freq(ch[Math.random() * 3 | 0] + 12 + (Math.random() < 0.3 ? 2 : 0)), t, beat * 0.9, 'sine', 0.035);
        state.next += beat / 2; state.step++;
      }
      state.timer = setTimeout(sched, 150);
    };
    sched();
    this.music = state;
  },
  stopMusic() { if (this.music) { this.music.stop = true; clearTimeout(this.music.timer); this.music = null; } this.wantMusic = this.wantMusic; },
  musicOff() { this.wantMusic = null; this.stopMusic(); }
};
// звук кнопок интерфейса
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => Sound.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Sound.ctx && Sound.ctx.state !== 'running') try { Sound.ctx.resume(); } catch (e) { } });
document.addEventListener('click', e => { if (e.target.closest('button')) Sound.play('click', { vol: 0.6 }); }, { capture: true });
