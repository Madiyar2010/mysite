// Сеть: комнаты через PeerJS (WebRTC). Хост ведёт игру, остальные шлют ему свои действия.
const PREFIX = 'hero-arena-v1-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_OPTS = { debug: 0, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };

export const Net = {
  peer: null, isHost: false, conns: new Map(), hostConn: null, myPid: null, code: '',
  onMessage: () => {},          // (msg) — сообщение для этого устройства
  onHostMessage: () => {},      // (pid, msg) — только у хоста
  onPeerLeft: () => {},         // (pid) — только у хоста
  onHostLost: () => {},

  sendTo(pid, msg) {
    if (pid === this.myPid) { this.onMessage(msg); return; }
    const c = this.conns.get(pid);
    if (c && c.open) try { c.send(msg); } catch (e) { }
  },
  broadcast(msg, exceptPid) {
    for (const [pid, c] of this.conns) if (pid !== exceptPid && c.open) try { c.send(msg); } catch (e) { }
    if (exceptPid !== this.myPid) this.onMessage(msg);
  },
  toHost(msg) {
    if (this.isHost) this.onHostMessage(this.myPid, msg);
    else if (this.hostConn && this.hostConn.open) try { this.hostConn.send(msg); } catch (e) { }
  },
  connectedPids() { return [...this.conns.keys()]; },
  drop(pid) { const c = this.conns.get(pid); this.conns.delete(pid); if (c) setTimeout(() => { try { c.close(); } catch (e) { } }, 300); },

  reset() {
    try { this.peer && this.peer.destroy(); } catch (e) { }
    this.peer = null; this.isHost = false; this.conns.clear(); this.hostConn = null; this.code = '';
  },

  host(tries = 0) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('nolib'));
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.random() * CODE_CHARS.length | 0];
      const peer = new Peer(PREFIX + code, PEER_OPTS);
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; this.isHost = true; this.code = code; resolve(code); });
      peer.on('connection', conn => {
        conn.on('data', msg => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'hello' && typeof msg.pid === 'string') {
            const old = this.conns.get(msg.pid);
            conn.pid = msg.pid; this.conns.set(msg.pid, conn);
            if (old && old !== conn) try { old.close(); } catch (e) { }
          }
          if (conn.pid) this.onHostMessage(conn.pid, msg);
        });
        conn.on('close', () => {
          if (conn.pid && this.conns.get(conn.pid) === conn) { this.conns.delete(conn.pid); this.onPeerLeft(conn.pid); }
        });
        conn.on('error', () => { });
      });
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { } });
      peer.on('error', e => {
        if (!opened) {
          try { peer.destroy(); } catch (_) { }
          if (e.type === 'unavailable-id' && tries < 5) this.host(tries + 1).then(resolve, reject);
          else reject(e);
        }
      });
    });
  },

  join(code, hello) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('nolib'));
      const peer = new Peer(PEER_OPTS);
      this.peer = peer; this.code = code;
      let ok = false;
      const to = setTimeout(() => { if (!ok) { this.reset(); reject(new Error('timeout')); } }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => { ok = true; clearTimeout(to); conn.send(hello); resolve(); });
        conn.on('data', m => { if (m && typeof m === 'object') this.onMessage(m); });
        conn.on('close', () => { if (ok && this.hostConn === conn) this.onHostLost(); });
      });
      peer.on('error', e => {
        if (ok) return;
        clearTimeout(to); this.reset();
        reject(e.type === 'peer-unavailable' ? new Error('notfound') : e);
      });
    });
  }
};
