// Звуки (Kenney, CC0) и простая фоновая музыка, которая играется синтезатором прямо в браузере.
const FILES = ['click', 'select', 'back', 'confirm', 'error', 'toggle', 'open', 'close', 'tick', 'glitch', 'taskdone', 'step', 'drop', 'pop',
  'door_open', 'door_close', 'vent', 'kill', 'slime', 'lights', 'eject', 'computer', 'ambient', 'boom', 'laser', 'laser2', 'blaster', 'hit', 'explode', 'thud',
  'step0', 'step1', 'step2', 'step3', 'step4', 'j_crew', 'j_impostor', 'j_meeting', 'j_win', 'j_lose', 'j_start', 'j_report'];

const LSget = (k, d) => { try { const v = localStorage.getItem('ha_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const LSset = (k, v) => { try { localStorage.setItem('ha_' + k, JSON.stringify(v)); } catch (e) { } };

const MUSIC = {
  menu: { bpm: 92, vol: 1, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], pad: 'triangle', padV: 0.05, bass: 4, bassV: 0.09, lead: 0.28, leadV: 0.035 },
  battle: { bpm: 116, vol: 0.55, chords: [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]], pad: 'sawtooth', padV: 0.012, bass: 2, bassT: 'triangle', bassV: 0.1, walk: true, drums: 1, lead: 0.06, leadV: 0.02 },
  tense: { bpm: 66, vol: 0.6, chords: [[45, 48, 52], [46, 49, 53], [43, 46, 50], [44, 47, 51]], pad: 'sine', padV: 0.05, bass: 8, bassV: 0.08, drip: 0.6 },
  boss: { bpm: 138, vol: 0.6, chords: [[40, 43, 47], [41, 44, 48], [38, 41, 45], [39, 43, 46]], pad: 'sawtooth', padV: 0.015, bass: 2, bassT: 'sawtooth', bassV: 0.06, walk: true, drums: 2, lead: 0.1, leadV: 0.02 }
};
export const Sound = {
  ctx: null, buf: {}, sfxGain: null, musicGain: null, uiGain: null, master: null,
  sfxVol: LSget('sfxVol', 0.8), musicVol: LSget('musicVol', 0.35), uiVol: LSget('uiVol', 0.7), quiet: LSget('quiet', false),
  loops: {}, music: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') try { this.ctx.resume(); } catch (e) { } return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.uiGain = this.ctx.createGain(); this.uiGain.connect(this.master);
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
    this.uiGain.gain.value = this.uiVol * q;
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
    s.connect(g); node.connect(opts.ui ? this.uiGain : this.sfxGain);
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
  // Музыка играется синтезатором прямо в браузере (файлов нет, разрешения не нужны).
  // menu — весёлая, battle — бодрая для шутера, tense — тихая и загадочная для «Найди предателя», boss — быстрая для босса.
  playMusic(kind) {
    this.wantMusic = kind;
    if (!this.ctx) return;
    if (this.music && this.music.kind === kind) return;
    this.stopMusic();
    const ctx = this.ctx, out = ctx.createGain();
    const T = MUSIC[kind] || MUSIC.menu;
    out.gain.value = T.vol; out.connect(this.musicGain);
    const beat = 60 / T.bpm;
    const freq = n => 440 * Math.pow(2, (n - 69) / 12);
    if (!this.noise) { const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb; }
    const state = { kind, stop: false, next: ctx.currentTime + 0.1, step: 0, out };
    const note = (f, t, d, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    };
    const kick = (t, v = 0.35) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); };
    const hiss = (t, v, d, f, type) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = this.noise; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.3); s.stop(t + d + 0.02); };
    const sched = () => {
      if (state.stop) return;
      while (state.next < ctx.currentTime + 0.4) {
        const t = state.next, s = state.step, ch = T.chords[Math.floor(s / 16) % T.chords.length];
        // аккорд (долгий фон)
        if (s % 16 === 0) ch.forEach(n => note(freq(n), t, beat * 7.8, T.pad, T.padV));
        // бас
        if (T.bass && s % T.bass === 0) note(freq(ch[0] - 12 + (T.walk && s % 8 === 4 ? 7 : 0)), t, beat * (T.bass / 4) * 1.6, T.bassT || 'sine', T.bassV);
        // мелодия
        if (T.lead && Math.random() < T.lead) note(freq(ch[Math.random() * 3 | 0] + 12 + (Math.random() < 0.3 ? 2 : 0)), t, beat * 0.9, 'sine', T.leadV);
        // барабаны
        if (T.drums) {
          if (s % 4 === 0 && (T.drums > 1 || s % 8 === 0)) kick(t);
          if (s % 8 === 4) hiss(t, 0.12, 0.18, 1800, 'bandpass');
          if (s % 2 === 0) hiss(t, s % 4 === 2 ? 0.05 : 0.03, 0.05, 7000, 'highpass');
        }
        // загадочные «капли» для предателя
        if (T.drip && s % 8 === 0 && Math.random() < T.drip) note(freq(ch[2] + 24), t, beat * 2, 'triangle', 0.03);
        state.next += beat / 4; state.step++;
      }
      state.timer = setTimeout(sched, 150);
    };
    sched();
    this.music = state;
  },
  stopMusic() { if (this.music) { const m = this.music; m.stop = true; clearTimeout(m.timer); try { m.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); setTimeout(() => m.out.disconnect(), 800); } catch (e) { } this.music = null; } },
  // звон монет: несколько коротких «дзинь» вверх
  coin(n = 3) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < n; i++) for (const [f, v] of [[1568, 0.12], [2093, 0.07]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.09;
      o.type = 'triangle'; o.frequency.value = f * (1 + i * 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(this.uiGain); o.start(t); o.stop(t + 0.4);
    }
  },
  musicOff() { this.wantMusic = null; this.stopMusic(); }
};
// звук кнопок интерфейса
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => Sound.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Sound.ctx && Sound.ctx.state !== 'running') try { Sound.ctx.resume(); } catch (e) { } });
document.addEventListener('click', e => { if (e.target.closest('button')) Sound.play('click', { vol: 0.6, ui: true }); }, { capture: true });
