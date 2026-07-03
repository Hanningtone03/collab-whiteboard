import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { RoomManager } from './server/roomManager.js';
import { loadSnapshot, saveSnapshot } from './server/persistence.js';
import { WhiteboardCRDT } from './crdt/whiteboardCRDT.js';

const PORT = process.env.PORT || 8090;
const manager = new RoomManager();
const wss = new WebSocketServer({ port: PORT });

const CLIENT_COLORS = ['#d99a3a', '#5aa9e6', '#e65a8c', '#5ae67d', '#c95ae6'];

async function hydrateRoom(roomId) {
  const room = manager.getOrCreateRoom(roomId);
  if (room.crdt.strokes.size === 0) {
    const snapshot = await loadSnapshot(roomId);
    if (snapshot.length > 0) {
      const restored = WhiteboardCRDT.fromSnapshot(`server-${roomId}`, snapshot);
      room.crdt = restored;
    }
  }
  return room;
}

let saveTimer = null;
function scheduleSave(roomId, room) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSnapshot(roomId, room.crdt.snapshot()).catch((err) => {
      console.error('failed to save snapshot', err);
    });
  }, 500);
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
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

  manager.broadcast(roomId, {
    type: 'presence-join',
    clientId,
    color: client.color,
  }, clientId);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
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
      }, clientId);
      return;
    }
  });

  ws.on('close', () => {
    manager.removeClient(roomId, clientId);
    manager.broadcast(roomId, { type: 'presence-leave', clientId }, clientId);
  });
});

console.log(`whiteboard server listening on ws://localhost:${PORT}`);
