import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { RoomManager } from './roomManager.js';
import { loadSnapshot, saveSnapshot } from './persistence.js';
import { WhiteboardCRDT } from '../crdt/whiteboardCRDT.js';

const CLIENT_COLORS = ['#d99a3a', '#5aa9e6', '#e65a8c', '#5ae67d', '#c95ae6'];

export function createWhiteboardServer({ port, host = '127.0.0.1', saveDebounceMs = 500 } = {}) {
  const manager = new RoomManager();
  const wss = new WebSocketServer({ port, host });
  const saveTimers = new Map();

  async function hydrateRoom(roomId) {
    const room = manager.getOrCreateRoom(roomId);
    if (room.crdt.strokes.size === 0) {
      const snapshot = await loadSnapshot(roomId);
      if (snapshot.length > 0) {
        room.crdt = WhiteboardCRDT.fromSnapshot(`server-${roomId}`, snapshot);
      }
    }
    return room;
  }

  function scheduleSave(roomId, room) {
    clearTimeout(saveTimers.get(roomId));
    const timer = setTimeout(() => {
      saveSnapshot(roomId, room.crdt.snapshot()).catch((err) => {
        console.error('failed to save snapshot', err);
      });
    }, saveDebounceMs);
    saveTimers.set(roomId, timer);
  }

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    const roomId = url.searchParams.get('room') || 'default';
    const clientId = randomUUID();

    const room = await hydrateRoom(roomId);
    manager.addClient(roomId, clientId, ws);

    const client = room.clients.get(clientId);
    client.color = CLIENT_COLORS[room.clients.size % CLIENT_COLORS.length];

    ws.send(JSON.stringify({
      type: 'init',
      clientId,
      color: client.color,
      snapshot: room.crdt.snapshot(),
      presence: manager.presenceList(roomId),
    }));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'set-name') {
        client.name = String(msg.name || '').slice(0, 20);
        manager.broadcast(roomId, {
          type: 'presence-join',
          clientId,
          color: client.color,
          name: client.name,
        }, clientId);
        return;
      }

      if (msg.type === 'op') {
        const applied = room.crdt.applyOperation(msg.op);
        if (applied) {
          manager.broadcast(roomId, { type: 'op', op: msg.op }, clientId);
          scheduleSave(roomId, room);
        }
        return;
      }

      if (msg.type === 'cursor') {
        client.cursor = msg.cursor;
        manager.broadcast(roomId, {
          type: 'cursor',
          clientId,
          cursor: msg.cursor,
          color: client.color,
          name: client.name,
        }, clientId);
        return;
      }
    });

    ws.on('close', () => {
      manager.removeClient(roomId, clientId);
      manager.broadcast(roomId, { type: 'presence-leave', clientId }, clientId);
    });
  });

  function close() {
    return new Promise((resolve) => {
      for (const timer of saveTimers.values()) {
        clearTimeout(timer);
      }
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close(() => resolve());
    });
  }

  return { wss, manager, close };
}
