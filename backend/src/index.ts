import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import visitRoutes from './routes/visitRoutes.js';
import careRoutes from './routes/careRoutes.js';
import apiVisitRoutes from './routes/apiVisitRoutes.js';
import apiGeoRoutes from './routes/apiGeoRoutes.js';
import apiCareMapRoutes from './routes/apiCareMapRoutes.js';
import apiOtcRoutes from './routes/apiOtcRoutes.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.use(visitRoutes);
app.use(careRoutes);
app.use(apiVisitRoutes);
app.use(apiGeoRoutes);
app.use(apiCareMapRoutes);
app.use(apiOtcRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'carezoom-api' });
});

app.listen(config.port, () => {
  console.log(`CareZoom API listening on http://localhost:${config.port}`);
});
