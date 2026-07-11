import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3300;

const app = express();
app.use(express.json());
app.use('/api', createApiRouter());
app.use(express.static(path.join(__dirname, '../../public')));

app.listen(PORT, () => {
  console.log(`Ratchet Loop A dashboard running at http://localhost:${PORT}`);
});
