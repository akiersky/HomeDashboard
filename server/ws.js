'use strict';
// Just enough WebSocket server for JSON text messages: handshake, masked client frames, ping/pong, close.
const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 20;

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

// Upgrades the request and calls onMessage(text) for each message; returns { send(text), close() }.
function accept(req, socket, onMessage, onClose = () => {}) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${crypto.createHash('sha1').update(key + GUID).digest('base64')}\r\n\r\n`);

  let buf = Buffer.alloc(0), message = [], closed = false;
  const done = () => { if (!closed) { closed = true; onClose(); } };
  const conn = {
    send: (text) => { if (!closed) socket.write(frame(1, Buffer.from(text))); },
    ping: () => { if (!closed) socket.write(frame(9, Buffer.alloc(0))); },
    close: () => { if (!closed) socket.end(frame(8, Buffer.alloc(0))); done(); }
  };

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, opcode = buf[0] & 15, masked = buf[1] & 0x80;
      let len = buf[1] & 127, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (len > MAX_MESSAGE) return conn.close();
      const end = at + (masked ? 4 : 0) + len;
      if (buf.length < end) return;
      const payload = Buffer.from(buf.subarray(masked ? at + 4 : at, end));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[at + (i & 3)];
      buf = buf.subarray(end);
      if (opcode === 8) return conn.close();
      if (opcode === 9) { socket.write(frame(10, payload)); continue; }
      if (opcode === 10) continue;
      message.push(payload);
      if (fin) { const text = Buffer.concat(message).toString(); message = []; onMessage(text); }
    }
  });
  socket.on('close', done);
  socket.on('error', done);
  return conn;
}

module.exports = { accept };
