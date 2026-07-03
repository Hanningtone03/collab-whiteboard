import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/server/roomManager.js';

function fakeSocket() {
  const sent = [];
  return {
    readyState: 1,
    OPEN: 1,
    send: (msg) => sent.push(msg),
    sentMessages: sent,
  };
}

test('getOrCreateRoom creates a room on first access', () => {
  const manager = new RoomManager();
  const room = manager.getOrCreateRoom('room1');
  assert.ok(room.crdt);
  assert.equal(room.clients.size, 0);
});

test('addClient registers a client in the room', () => {
  const manager = new RoomManager();
  const ws = fakeSocket();
  manager.addClient('room1', 'client-a', ws);
  const room = manager.getOrCreateRoom('room1');
  assert.equal(room.clients.size, 1);
});

test('removeClient deletes empty rooms', () => {
  const manager = new RoomManager();
  const ws = fakeSocket();
  manager.addClient('room1', 'client-a', ws);
  manager.removeClient('room1', 'client-a');
  assert.equal(manager.rooms.has('room1'), false);
});

test('broadcast sends to all clients except the excluded one', () => {
  const manager = new RoomManager();
  const wsA = fakeSocket();
  const wsB = fakeSocket();
  manager.addClient('room1', 'client-a', wsA);
  manager.addClient('room1', 'client-b', wsB);

  manager.broadcast('room1', { type: 'test' }, 'client-a');

  assert.equal(wsA.sentMessages.length, 0);
  assert.equal(wsB.sentMessages.length, 1);
});

test('presenceList only includes clients with a set cursor', () => {
  const manager = new RoomManager();
  const wsA = fakeSocket();
  manager.addClient('room1', 'client-a', wsA);
  const room = manager.getOrCreateRoom('room1');
  room.clients.get('client-a').cursor = { x: 10, y: 20 };

  const presence = manager.presenceList('room1');
  assert.equal(presence.length, 1);
  assert.deepEqual(presence[0].cursor, { x: 10, y: 20 });
});
