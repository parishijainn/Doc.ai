import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import visitRoutes from './routes/visitRoutes.js';
import careRoutes from './routes/careRoutes.js';
import tavusRoutes from './routes/tavusRoutes.js';
import apiVisitRoutes from './routes/apiVisitRoutes.js';
import apiGeoRoutes from './routes/apiGeoRoutes.js';
import apiCareMapRoutes from './routes/apiCareMapRoutes.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.use(visitRoutes);
app.use(careRoutes);
app.use(tavusRoutes);
app.use(apiVisitRoutes);
app.use(apiGeoRoutes);
app.use(apiCareMapRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'carezoom-api' });
});

app.listen(config.port, () => {
  console.log(`CareZoom API listening on http://localhost:${config.port}`);
});
