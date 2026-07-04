import { createWhiteboardServer } from './server/wsServer.js';

const PORT = process.env.PORT || 8090;
createWhiteboardServer({ port: PORT, host: '0.0.0.0' });
console.log(`whiteboard server listening on ws://0.0.0.0:${PORT}`);
