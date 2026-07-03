import { LamportClock } from './lamportClock.js';

export class WhiteboardCRDT {
  constructor(clientId) {
    this.clientId = clientId;
    this.clock = new LamportClock(clientId);
    this.strokes = new Map();
  }

  createAddOperation(stroke) {
    const stamp = this.clock.tick();
    const op = {
      type: 'add',
      strokeId: stroke.id,
      stamp,
      data: stroke,
    };
    this.applyOperation(op);
    return op;
  }

  createDeleteOperation(strokeId) {
    const stamp = this.clock.tick();
    const op = {
      type: 'delete',
      strokeId,
      stamp,
      data: null,
    };
    this.applyOperation(op);
    return op;
  }

  applyOperation(op) {
    this.clock.observe(op.stamp.timestamp);

    const existing = this.strokes.get(op.strokeId);
    if (existing && LamportClock.compare(existing.stamp, op.stamp) >= 0) {
      return false;
    }

    this.strokes.set(op.strokeId, {
      stamp: op.stamp,
      deleted: op.type === 'delete',
      data: op.type === 'add' ? op.data : existing ? existing.data : null,
    });
    return true;
  }

  visibleStrokes() {
    const result = [];
    for (const [id, entry] of this.strokes) {
      if (!entry.deleted && entry.data) {
        result.push(entry.data);
      }
    }
    return result;
  }

  applyOperations(ops) {
    for (const op of ops) {
      this.applyOperation(op);
    }
  }

  snapshot() {
    return Array.from(this.strokes.entries()).map(([strokeId, entry]) => ({
      strokeId,
      stamp: entry.stamp,
      deleted: entry.deleted,
      data: entry.data,
    }));
  }

  static fromSnapshot(clientId, snapshot) {
    const crdt = new WhiteboardCRDT(clientId);
    for (const entry of snapshot) {
      crdt.strokes.set(entry.strokeId, {
        stamp: entry.stamp,
        deleted: entry.deleted,
        data: entry.data,
      });
      crdt.clock.observe(entry.stamp.timestamp);
    }
    return crdt;
  }
}
