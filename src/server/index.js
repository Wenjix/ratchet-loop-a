import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3300;

const app = express();
app.use(express.json());
app.use('/api', createApiRouter());

const webDist = path.join(__dirname, '../../web/dist');
if (!existsSync(webDist)) {
  console.warn('web/dist not found — run `npm run web:install && npm run build` to build the dashboard.');
}
app.use(express.static(webDist));

app.listen(PORT, () => {
  console.log(`Ratchet Loop A dashboard running at http://localhost:${PORT}`);
});
