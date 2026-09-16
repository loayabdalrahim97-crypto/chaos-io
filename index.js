// Server entry point — Express + Colyseus, one persistent "arena" room that
// waits for players, fills empty seats with bots after a short grace period,
// and loops forever (drops bots after each match, waits for the next humans).
import http from 'http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
const { Server } = colyseus;
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './rooms/ArenaRoom.js';

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (_req, res) => res.send('chaos-io arena server is up'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define('arena', ArenaRoom);

gameServer.listen(PORT).then(() => {
  console.log(`[chaos-io] listening on :${PORT}`);
});
