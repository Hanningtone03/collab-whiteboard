class LamportClock {
  constructor(clientId) {
    this.clientId = clientId;
    this.time = 0;
  }

  tick() {
    this.time += 1;
    return { timestamp: this.time, clientId: this.clientId };
  }

  observe(remoteTimestamp) {
    this.time = Math.max(this.time, remoteTimestamp) + 1;
  }

  static compare(a, b) {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
  }
}

class WhiteboardCRDT {
  constructor(clientId) {
    this.clientId = clientId;
    this.clock = new LamportClock(clientId);
    this.strokes = new Map();
  }

  createAddOperation(stroke) {
    const stamp = this.clock.tick();
    const op = { type: 'add', strokeId: stroke.id, stamp, data: stroke };
    this.applyOperation(op);
    return op;
  }

  createDeleteOperation(strokeId) {
    const stamp = this.clock.tick();
    const op = { type: 'delete', strokeId, stamp, data: null };
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
    for (const entry of this.strokes.values()) {
      if (!entry.deleted && entry.data) result.push(entry.data);
    }
    return result.sort((a, b) => a.seq - b.seq);
  }

  loadSnapshot(snapshot) {
    for (const entry of snapshot) {
      this.strokes.set(entry.strokeId, {
        stamp: entry.stamp,
        deleted: entry.deleted,
        data: entry.data,
      });
      this.clock.observe(entry.stamp.timestamp);
    }
  }
}
