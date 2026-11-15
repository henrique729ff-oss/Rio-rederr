// Moto Rio — servidor online. Serve o jogo (public/index.html) e repassa
// as mensagens (pose, roupa, preso, solto) entre todos os jogadores em /ws.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const raw = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const gz = zlib.gzipSync(raw, { level: 9 });

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url === '/' || url === '/index.html') {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = gz.length;
      res.writeHead(200, headers);
      return res.end(gz);
    }
    headers['Content-Length'] = raw.length;
    res.writeHead(200, headers);
    return res.end(raw);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

function broadcastCount() {
  const msg = JSON.stringify({ t: 'count', n: wss.clients.size });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.tokens = 80; // limite de mensagens por segundo
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary || ws.tokens <= 0) return;
    ws.tokens--;
    const text = data.toString();
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(text);
  });
  ws.on('close', broadcastCount);
  broadcastCount();
});

let tick = 0;
setInterval(() => {
  tick++;
  for (const c of wss.clients) c.tokens = 80;
  if (tick % 25 === 0) {
    for (const c of wss.clients) {
      if (!c.alive) { c.terminate(); continue; }
      c.alive = false;
      c.ping();
    }
    broadcastCount();
  }
}, 1000);

server.listen(PORT, () => console.log('Moto Rio online na porta ' + PORT));
