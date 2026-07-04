import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createWhiteboardServer } from '../src/server/wsServer.js';

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  });
}

function waitForOpen(ws) {
  return new Promise((resolve) => ws.once('open', resolve));
}

function waitForClose(ws) {
  return new Promise((resolve) => ws.once('close', resolve));
}

async function closeClient(ws) {
  const closed = waitForClose(ws);
  ws.close();
  await closed;
}

test('a connecting client receives an init message with an empty snapshot', async () => {
  const { close } = createWhiteboardServer({ port: 9401 });
  const ws = new WebSocket('ws://127.0.0.1:9401?room=test-init');
  const opened = waitForOpen(ws);
  const firstMessage = waitForMessage(ws);

  await opened;
  const msg = await firstMessage;

  assert.equal(msg.type, 'init');
  assert.ok(msg.clientId);
  assert.deepEqual(msg.snapshot, []);

  await closeClient(ws);
  await close();
});

test('an op from one client is broadcast to another client in the same room', async () => {
  const { close } = createWhiteboardServer({ port: 9402 });

  const wsA = new WebSocket('ws://127.0.0.1:9402?room=test-broadcast');
  const openedA = waitForOpen(wsA);
  const initA = waitForMessage(wsA);
  await openedA;
  await initA;

  const wsB = new WebSocket('ws://127.0.0.1:9402?room=test-broadcast');
  const openedB = waitForOpen(wsB);
  const initB = waitForMessage(wsB);
  await openedB;
  await initB;

  const op = {
    type: 'add',
    strokeId: 's1',
    stamp: { timestamp: 1, clientId: 'a' },
    data: { id: 's1', points: [[0, 0], [10, 10]], color: '#fff', width: 2 },
  };

  const received = waitForMessage(wsB);
  wsA.send(JSON.stringify({ type: 'op', op }));
  const msg = await received;

  assert.equal(msg.type, 'op');
  assert.equal(msg.op.strokeId, 's1');

  await closeClient(wsA);
  await closeClient(wsB);
  await close();
});

test('clients in different rooms do not see each other\'s ops', async () => {
  const { close } = createWhiteboardServer({ port: 9403 });

  const wsA = new WebSocket('ws://127.0.0.1:9403?room=room-a');
  const openedA = waitForOpen(wsA);
  const initA = waitForMessage(wsA);
  await openedA;
  await initA;

  const wsB = new WebSocket('ws://127.0.0.1:9403?room=room-b');
  const openedB = waitForOpen(wsB);
  const initB = waitForMessage(wsB);
  await openedB;
  await initB;

  let receivedInB = false;
  wsB.on('message', () => { receivedInB = true; });

  wsA.send(JSON.stringify({
    type: 'op',
    op: {
      type: 'add',
      strokeId: 's1',
      stamp: { timestamp: 1, clientId: 'a' },
      data: { id: 's1', points: [[0, 0], [1, 1]], color: '#fff', width: 2 },
    },
  }));

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(receivedInB, false);

  await closeClient(wsA);
  await closeClient(wsB);
  await close();
});

test('cursor messages are broadcast but not stored in the CRDT', async () => {
  const { manager, close } = createWhiteboardServer({ port: 9404 });

  const wsA = new WebSocket('ws://127.0.0.1:9404?room=test-cursor');
  const openedA = waitForOpen(wsA);
  const initA = waitForMessage(wsA);
  await openedA;
  await initA;

  const wsB = new WebSocket('ws://127.0.0.1:9404?room=test-cursor');
  const openedB = waitForOpen(wsB);
  const initB = waitForMessage(wsB);
  await openedB;
  await initB;

  const received = waitForMessage(wsB);
  wsA.send(JSON.stringify({ type: 'cursor', cursor: { x: 5, y: 5 } }));
  const msg = await received;

  assert.equal(msg.type, 'cursor');
  assert.deepEqual(msg.cursor, { x: 5, y: 5 });

  const room = manager.getOrCreateRoom('test-cursor');
  assert.equal(room.crdt.strokes.size, 0);

  await closeClient(wsA);
  await closeClient(wsB);
  await close();
});

test('a client disconnecting triggers a presence-leave broadcast', async () => {
  const { close } = createWhiteboardServer({ port: 9405 });

  const wsA = new WebSocket('ws://127.0.0.1:9405?room=test-leave');
  const openedA = waitForOpen(wsA);
  const initA = waitForMessage(wsA);
  await openedA;
  await initA;

  const wsB = new WebSocket('ws://127.0.0.1:9405?room=test-leave');
  const openedB = waitForOpen(wsB);
  const initB = waitForMessage(wsB);
  await openedB;
  await initB;

  const leaveMsg = waitForMessage(wsB);
  await closeClient(wsA);
  const msg = await leaveMsg;

  assert.equal(msg.type, 'presence-leave');

  await closeClient(wsB);
  await close();
});
