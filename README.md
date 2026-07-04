![CI](https://github.com/Hanningtone03/collab-whiteboard/actions/workflows/ci.yml/badge.svg)

# collab-whiteboard

A real-time collaborative whiteboard built from scratch in Node.js — CRDT-based conflict resolution over WebSockets, so multiple users can draw simultaneously without locking or waiting on each other.

## How it works

Every stroke is tracked as an add or delete operation stamped with a Lamport clock, giving each operation a logical timestamp plus the originating client's ID as a tiebreaker. When two replicas apply the same set of operations in different orders — which happens constantly with concurrent users on unreliable networks — they still converge to an identical final state, since conflicting writes to the same stroke resolve deterministically by comparing Lamport timestamps rather than by arrival order.

The server holds one CRDT instance per room, broadcasting every accepted operation to all other connected clients and periodically persisting a snapshot to disk so a room survives a server restart. The frontend runs its own CRDT instance locally, applying operations optimistically the instant they're drawn and merging in remote operations as they arrive over the WebSocket connection.

## Features

- Pen, line, rectangle, circle, and text tools
- Undo/redo, including across concurrent edits from other users
- Live cursor presence with display names
- Shareable room links — anyone with the link joins the same board
- Light/dark mode, grid background, adjustable brush size and shape
- Export the board as a PNG

## Project structure

    src/
    ├── crdt/
    │   ├── lamportClock.js       logical clock for causality tracking
    │   └── whiteboardCRDT.js     the actual CRDT stroke store
    ├── server/
    │   ├── roomManager.js        per-room client and broadcast management
    │   ├── persistence.js        snapshot save/load to disk
    │   └── wsServer.js           WebSocket connection handling
    └── server.js                 entry point

    public/
    ├── index.html
    ├── style.css
    ├── board.js                  canvas rendering, drawing, sync client
    └── whiteboardCRDT.js         browser-side copy of the CRDT logic

## Running locally

    npm install
    node src/server.js
    node src/staticServer.js

Then open http://localhost:5500 in two browser tabs to see live sync in action.

## Testing

    npm test

## Live demo

[link once deployed]

## Tech

- Node.js, native WebSockets (`ws`)
- No frontend framework — vanilla JS and HTML5 canvas
- No database — CRDT snapshots persisted as JSON on disk

## License

MIT
