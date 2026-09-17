import { Client } from 'colyseus.js';

// Production default: the deployed Colyseus server on Railway.
// Local dev: served from localhost, so fall back to same-host :2567.
// Always overridable with ?server=ws://host:port
const PROD_SERVER = 'wss://server-production-5445.up.railway.app';

export function serverUrl() {
  const qp = new URLSearchParams(location.search).get('server');
  if (qp) return qp;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `ws://${location.hostname}:2567`;
  }
  return PROD_SERVER;
}

export async function joinArena(loadout, mode = 'solo') {
  const client = new Client(serverUrl());
  return client.joinOrCreate(mode === 'duo' ? 'duo' : 'arena', loadout);
}
