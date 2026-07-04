import express from 'express';
import path from 'node:path';

const app = express();
const PORT = process.env.STATIC_PORT || 5500;

app.use(express.static(path.resolve('public')));

app.listen(PORT, () => {
  console.log(`static frontend listening on http://localhost:${PORT}`);
});
