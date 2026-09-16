import { Client } from 'colyseus.js';

// Same-origin dev convenience: talk to the colyseus server on :2567 of whatever host
// is serving the page, unless overridden with ?server=ws://host:port
export function serverUrl() {
  const qp = new URLSearchParams(location.search).get('server');
  if (qp) return qp;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:2567`;
}

export async function joinArena(name) {
  const client = new Client(serverUrl());
  const room = await client.joinOrCreate('arena', { name });
  return room;
}
