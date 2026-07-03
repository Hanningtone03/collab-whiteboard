import test from 'node:test';
import assert from 'node:assert/strict';
import { WhiteboardCRDT } from '../src/crdt/whiteboardCRDT.js';

test('a single add operation becomes visible', () => {
  const crdt = new WhiteboardCRDT('client-a');
  crdt.createAddOperation({ id: 's1', points: [[0, 0], [10, 10]], color: '#fff' });
  const visible = crdt.visibleStrokes();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 's1');
});

test('a delete operation removes a previously added stroke', () => {
  const crdt = new WhiteboardCRDT('client-a');
  crdt.createAddOperation({ id: 's1', points: [], color: '#fff' });
  crdt.createDeleteOperation('s1');
  assert.equal(crdt.visibleStrokes().length, 0);
});

test('two replicas converge to the same state regardless of operation order', () => {
  const replicaA = new WhiteboardCRDT('client-a');
  const replicaB = new WhiteboardCRDT('client-b');

  const op1 = replicaA.createAddOperation({ id: 's1', points: [], color: '#f00' });
  const op2 = replicaA.createAddOperation({ id: 's2', points: [], color: '#0f0' });
  const op3 = replicaA.createDeleteOperation('s1');

  replicaB.applyOperations([op3, op1, op2]);

  const aVisible = replicaA.visibleStrokes().map((s) => s.id).sort();
  const bVisible = replicaB.visibleStrokes().map((s) => s.id).sort();

  assert.deepEqual(aVisible, bVisible);
  assert.deepEqual(aVisible, ['s2']);
});

test('concurrent add and delete on the same stroke resolve deterministically by Lamport order', () => {
  const replicaA = new WhiteboardCRDT('client-a');
  const replicaB = new WhiteboardCRDT('client-b');

  const addOp = replicaA.createAddOperation({ id: 's1', points: [], color: '#fff' });
  replicaB.applyOperation(addOp);

  const deleteOp = replicaA.createDeleteOperation('s1');
  const laterAddOp = replicaB.createAddOperation({ id: 's1', points: [1], color: '#000' });

  replicaA.applyOperation(laterAddOp);
  replicaB.applyOperation(deleteOp);

  const aVisible = replicaA.visibleStrokes();
  const bVisible = replicaB.visibleStrokes();

  assert.deepEqual(aVisible, bVisible);
});

test('applying the same operation twice is idempotent', () => {
  const crdt = new WhiteboardCRDT('client-a');
  const op = crdt.createAddOperation({ id: 's1', points: [], color: '#fff' });
  crdt.applyOperation(op);
  crdt.applyOperation(op);
  assert.equal(crdt.visibleStrokes().length, 1);
});

test('fromSnapshot reconstructs identical visible state', () => {
  const original = new WhiteboardCRDT('client-a');
  original.createAddOperation({ id: 's1', points: [], color: '#fff' });
  original.createAddOperation({ id: 's2', points: [], color: '#000' });
  original.createDeleteOperation('s1');

  const restored = WhiteboardCRDT.fromSnapshot('client-b', original.snapshot());

  assert.deepEqual(
    restored.visibleStrokes().map((s) => s.id),
    original.visibleStrokes().map((s) => s.id)
  );
});
