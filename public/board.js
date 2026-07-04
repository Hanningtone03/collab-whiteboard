const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const widthPicker = document.getElementById('widthPicker');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const shareBtn = document.getElementById('shareBtn');
const presenceListEl = document.getElementById('presenceList');
const cursorLayer = document.getElementById('cursorLayer');
const paletteEl = document.getElementById('palette');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const toolGroup = document.getElementById('toolGroup');
const namePrompt = document.getElementById('namePrompt');
const nameInput = document.getElementById('nameInput');
const nameSubmitBtn = document.getElementById('nameSubmitBtn');
const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const closeShareBtn = document.getElementById('closeShareBtn');

const PALETTE_COLORS = ['#d99a3a', '#e65a8c', '#5aa9e6', '#5ae67d', '#c95ae6', '#e6e05a', '#e8e2d4', '#1a1712'];
let brushShape = 'round';
let currentTool = 'pen';
let myName = localStorage.getItem('whiteboard-name') || '';

function ensureRoomId() {
  const params = new URLSearchParams(window.location.search);
  let room = params.get('room');
  if (!room) {
    room = Math.random().toString(36).slice(2, 8);
    params.set('room', room);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
  return room;
}
const roomId = ensureRoomId();

if (!myName) {
  namePrompt.classList.remove('hidden');
} else {
  nameInput.value = myName;
}

nameSubmitBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Anonymous';
  localStorage.setItem('whiteboard-name', name);
  myName = name;
  namePrompt.classList.add('hidden');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set-name', name }));
  }
});

shareBtn.addEventListener('click', () => {
  shareLinkInput.value = window.location.href;
  shareModal.classList.remove('hidden');
});
closeShareBtn.addEventListener('click', () => shareModal.classList.add('hidden'));
copyLinkBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareLinkInput.value);
  copyLinkBtn.textContent = 'Copied!';
  setTimeout(() => { copyLinkBtn.textContent = 'Copy link'; }, 1500);
});

toolGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.tool-btn');
  if (!btn) return;
  currentTool = btn.dataset.tool;
  document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
});

function renderPalette() {
  paletteEl.innerHTML = '';
  PALETTE_COLORS.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch' + (i === 0 ? ' active' : '');
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      colorPicker.value = color;
      document.querySelectorAll('.palette-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
    });
    paletteEl.appendChild(swatch);
  });
}
renderPalette();

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.querySelectorAll('input[name="brushShape"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    brushShape = e.target.value;
  });
});

document.querySelectorAll('input[name="canvasBg"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    canvas.classList.remove('bg-grid', 'bg-light');
    if (e.target.value === 'grid') canvas.classList.add('bg-grid');
    if (e.target.value === 'light') canvas.classList.add('bg-light');
  });
});

let isLightMode = false;
themeToggleBtn.addEventListener('click', () => {
  isLightMode = !isLightMode;
  document.body.classList.toggle('light-mode', isLightMode);
  themeToggleBtn.textContent = isLightMode ? '☀' : '🌙';
});

exportBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `whiteboard-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - document.querySelector('.topbar').offsetHeight;
  redraw();
}
window.addEventListener('resize', resizeCanvas);

const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = `${wsProtocol}://${window.location.hostname}:8090?room=${roomId}`;

let ws = null;
let clientId = null;
let myColor = colorPicker.value;
let crdt = null;
let seqCounter = 0;
let localOpsStack = [];
let redoStack = [];
let drawing = false;
let currentStroke = null;
const remoteCursors = new Map();

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    if (myName) {
      ws.send(JSON.stringify({ type: 'set-name', name: myName }));
    }
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);

      if (msg.type === 'init') {
        clientId = msg.clientId;
        myColor = msg.color;
        colorPicker.value = myColor;
        crdt = new WhiteboardCRDT(clientId);
        crdt.loadSnapshot(msg.snapshot);
        redraw();
        msg.presence.forEach((p) => updatePresenceDot(p.clientId, p.color, p.name));
        return;
      }

      if (msg.type === 'op') {
        crdt.applyOperation(msg.op);
        redraw();
        return;
      }

      if (msg.type === 'cursor') {
        showRemoteCursor(msg.clientId, msg.cursor, msg.color, msg.name);
        return;
      }

      if (msg.type === 'presence-join') {
        updatePresenceDot(msg.clientId, msg.color, msg.name);
        return;
      }

      if (msg.type === 'presence-leave') {
        removePresenceDot(msg.clientId);
        removeRemoteCursor(msg.clientId);
        return;
      }
    } catch (err) {
      console.error('failed to handle incoming message', err, evt.data);
    }
  };

  ws.onclose = () => {
    setTimeout(connect, 1000);
  };
}

function sendOp(op) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'op', op }));
  }
}

function updatePresenceDot(id, color, name) {
  let dot = document.getElementById(`presence-${id}`);
  if (!dot) {
    dot = document.createElement('div');
    dot.id = `presence-${id}`;
    dot.className = 'presence-dot';
    presenceListEl.appendChild(dot);
  }
  dot.style.background = color;
  dot.title = name || 'Anonymous';
}

function removePresenceDot(id) {
  const dot = document.getElementById(`presence-${id}`);
  if (dot) dot.remove();
}

function showRemoteCursor(id, cursor, color, name) {
  let el = remoteCursors.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.style.background = color;
    cursorLayer.appendChild(el);
    remoteCursors.set(id, el);
  }
  el.dataset.label = name || id.slice(0, 6);
  el.style.left = `${cursor.x}px`;
  el.style.top = `${cursor.y}px`;
}

function removeRemoteCursor(id) {
  const el = remoteCursors.get(id);
  if (el) {
    el.remove();
    remoteCursors.delete(id);
  }
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!crdt) return;
  for (const stroke of crdt.visibleStrokes()) {
    drawStroke(stroke);
  }
}

function drawStroke(stroke) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.shape === 'square' ? 'square' : 'round';
  ctx.lineJoin = stroke.shape === 'square' ? 'miter' : 'round';

  if (stroke.tool === 'text') {
    ctx.font = `${12 + stroke.width * 3}px 'IBM Plex Mono', monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(stroke.text, stroke.points[0][0], stroke.points[0][1]);
    return;
  }

  if (stroke.tool === 'line') {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    ctx.lineTo(stroke.points[1][0], stroke.points[1][1]);
    ctx.stroke();
    return;
  }

  if (stroke.tool === 'rect') {
    if (stroke.points.length < 2) return;
    const [x0, y0] = stroke.points[0];
    const [x1, y1] = stroke.points[1];
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    return;
  }

  if (stroke.tool === 'circle') {
    if (stroke.points.length < 2) return;
    const [x0, y0] = stroke.points[0];
    const [x1, y1] = stroke.points[1];
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (stroke.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
  }
  ctx.stroke();
}

function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return [evt.clientX - rect.left, evt.clientY - rect.top];
}

function newStrokeId() {
  return `${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

canvas.addEventListener('mousedown', (evt) => {
  const pos = pointerPos(evt);

  if (currentTool === 'text') {
    const text = window.prompt('Enter text:');
    if (!text) return;
    const stroke = {
      id: newStrokeId(),
      tool: 'text',
      color: colorPicker.value,
      width: Number(widthPicker.value),
      points: [pos],
      text,
      seq: seqCounter++,
    };
    const op = crdt.createAddOperation(stroke);
    localOpsStack.push(op);
    sendOp(op);
    redraw();
    return;
  }

  drawing = true;
  redoStack = [];
  currentStroke = {
    id: newStrokeId(),
    tool: currentTool,
    color: colorPicker.value,
    width: Number(widthPicker.value),
    shape: brushShape,
    points: [pos],
    seq: seqCounter++,
  };
});

canvas.addEventListener('mousemove', (evt) => {
  const pos = pointerPos(evt);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cursor', cursor: { x: evt.clientX, y: evt.clientY } }));
  }

  if (!drawing || !currentStroke) return;

  if (currentTool === 'pen') {
    currentStroke.points.push(pos);
  } else {
    currentStroke.points[1] = pos;
  }

  redraw();
  drawStroke(currentStroke);
});

function finishStroke() {
  if (!drawing || !currentStroke) return;
  drawing = false;

  if (currentStroke.points.length >= 2 && currentStroke.points[1]) {
    const op = crdt.createAddOperation(currentStroke);
    localOpsStack.push(op);
    sendOp(op);
  }
  currentStroke = null;
  redraw();
}

canvas.addEventListener('mouseup', finishStroke);
canvas.addEventListener('mouseleave', finishStroke);

undoBtn.addEventListener('click', () => {
  const op = localOpsStack.pop();
  if (!op || op.type !== 'add') return;
  const deleteOp = crdt.createDeleteOperation(op.strokeId);
  redoStack.push(op);
  sendOp(deleteOp);
  redraw();
});

redoBtn.addEventListener('click', () => {
  const op = redoStack.pop();
  if (!op) return;
  const reAddOp = crdt.createAddOperation(op.data);
  localOpsStack.push(reAddOp);
  sendOp(reAddOp);
  redraw();
});

clearBtn.addEventListener('click', () => {
  for (const stroke of crdt.visibleStrokes()) {
    const deleteOp = crdt.createDeleteOperation(stroke.id);
    sendOp(deleteOp);
  }
  redraw();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoBtn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redoBtn.click();
  }
});

resizeCanvas();
connect();
