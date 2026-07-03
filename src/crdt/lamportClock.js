export class LamportClock {
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
