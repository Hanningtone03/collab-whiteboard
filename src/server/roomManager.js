import { WhiteboardCRDT } from '../crdt/whiteboardCRDT.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        crdt: new WhiteboardCRDT(`server-${roomId}`),
        clients: new Map(),
      });
    }
    return this.rooms.get(roomId);
  }

  addClient(roomId, clientId, ws) {
    const room = this.getOrCreateRoom(roomId);
    room.clients.set(clientId, { ws, cursor: null, color: null, name: null });
    return room;
  }

  removeClient(roomId, clientId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.clients.delete(clientId);
    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  broadcast(roomId, message, excludeClientId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const [clientId, client] of room.clients) {
      if (clientId === excludeClientId) continue;
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  presenceList(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.clients.entries())
      .filter(([, c]) => c.cursor !== null)
      .map(([clientId, c]) => ({ clientId, cursor: c.cursor, color: c.color, name: c.name }));
  }
}
