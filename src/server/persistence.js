import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.WHITEBOARD_DATA_DIR
  ? path.resolve(process.env.WHITEBOARD_DATA_DIR)
  : path.resolve('data');

export async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export function snapshotPath(roomId) {
  return path.join(DATA_DIR, `${roomId}.json`);
}

export async function loadSnapshot(roomId) {
  const filePath = snapshotPath(roomId);
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export async function saveSnapshot(roomId, snapshot) {
  await ensureDataDir();
  await writeFile(snapshotPath(roomId), JSON.stringify(snapshot), 'utf-8');
}
