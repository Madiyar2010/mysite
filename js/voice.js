// Голосовая связь на собраниях «Найди предателя»: держишь «Говорить» — тебя слышат все.
// Звук идёт через хоста: каждый гость звонит хосту, хост смешивает голоса и отправляет каждому гостю всех, кроме него самого.
import { Net } from './net.js';

const PREFIX = 'hero-arena-v1-';
export const Voice = {
  ctx: null, mic: null, micTrack: null, calls: new Map(), dest: new Map(), srcs: new Map(), hostMicSrc: null, out: null, talking: false, ready: false,
  audioCtx() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state !== 'running') try { this.ctx.resume(); } catch (e) { } return this.ctx; },
  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); },
  silent() { const ctx = this.audioCtx(), d = ctx.createMediaStreamDestination(); return d.stream; },
  // хост: принимаем звонки гостей
  hostListen() {
    if (!Net.isHost || !Net.peer || this.listening) return;
    this.listening = true;
    Net.peer.on('call', call => {
      const pid = call.metadata && call.metadata.pid; if (!pid) { call.close(); return; }
      const ctx = this.audioCtx();
      const d = ctx.createMediaStreamDestination(); this.dest.set(pid, d);
      for (const [other, src] of this.srcs) if (other !== pid) src.connect(d);
      if (this.hostMicSrc) this.hostMicSrc.connect(d);
      call.answer(d.stream);
      call.on('stream', st => {
        // Хрому нужен audio-элемент, иначе звук из WebRTC не идёт в WebAudio
        const a = new Audio(); a.muted = true; a.srcObject = st; a.play().catch(() => { });
        const src = ctx.createMediaStreamSource(st); this.srcs.set(pid, src);
        src.connect(ctx.destination);
        for (const [other, dd] of this.dest) if (other !== pid) src.connect(dd);
      });
      call.on('close', () => { this.dest.delete(pid); const s = this.srcs.get(pid); if (s) try { s.disconnect(); } catch (e) { } this.srcs.delete(pid); });
      this.calls.set(pid, call);
    });
  },
  // гость: звоним хосту (сначала с тишиной, микрофон — только по кнопке)
  join() {
    if (Net.isHost || !Net.peer || this.joined || !this.supported()) return;
    this.joined = true;
    const call = Net.peer.call(PREFIX + Net.code, this.silent(), { metadata: { pid: Net.myPid } });
    if (!call) { this.joined = false; return; }
    this.call = call;
    call.on('stream', st => {
      if (!this.out) { this.out = new Audio(); this.out.autoplay = true; this.out.setAttribute('playsinline', ''); }
      this.out.srcObject = st; this.out.play().catch(() => { this.needTap = true; });
    });
    call.on('close', () => { this.joined = false; this.call = null; });
    call.on('error', () => { this.joined = false; this.call = null; });
  },
  // по нажатию на экран: звук голосов, который браузер не дал включить сам
  unlock() { this.audioCtx(); if (this.out && this.needTap) this.out.play().then(() => { this.needTap = false; }).catch(() => { }); },
  async getMic() {
    if (this.micTrack) return this.micTrack;
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.mic = st; this.micTrack = st.getAudioTracks()[0]; this.micTrack.enabled = false;
    if (Net.isHost) {
      const ctx = this.audioCtx(); this.hostMicSrc = ctx.createMediaStreamSource(st);
      for (const d of this.dest.values()) this.hostMicSrc.connect(d);
    } else if (this.call && this.call.peerConnection) {
      const snd = this.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio') || this.call.peerConnection.getSenders()[0];
      if (snd) await snd.replaceTrack(this.micTrack);
    }
    return this.micTrack;
  },
  async talk(on) {
    this.unlock();
    if (on && !this.supported()) return 'nosupport';
    try {
      if (on) { const t = await this.getMic(); t.enabled = true; }
      else if (this.micTrack) this.micTrack.enabled = false;
      this.talking = on;
      return 'ok';
    } catch (e) { this.talking = false; return 'denied'; }
  },
  stop() {
    try { this.call && this.call.close(); } catch (e) { }
    for (const c of this.calls.values()) try { c.close(); } catch (e) { }
    this.calls.clear(); this.dest.clear(); this.srcs.clear(); this.call = null; this.joined = false; this.listening = false;
    if (this.mic) this.mic.getTracks().forEach(t => t.stop());
    this.mic = null; this.micTrack = null; this.hostMicSrc = null; this.talking = false;
    if (this.out) { this.out.srcObject = null; }
  }
};
