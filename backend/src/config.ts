import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  tavus: {
    apiKey: process.env.TAVUS_API_KEY ?? '',
    realtimeApiKey: process.env.TAVUS_REALTIME_API_KEY ?? '',
    personaId: process.env.TAVUS_PERSONA_ID ?? '',
    replicaId: process.env.TAVUS_REPLICA_ID ?? '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
  },
  maps: {
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN ?? '',
  },
  osrm: {
    baseUrl: process.env.OSRM_BASE_URL ?? 'http://router.project-osrm.org/route/v1',
  },
  audit: {
    logPath: process.env.AUDIT_LOG_PATH ?? './logs/audit.json',
    retentionDays: parseInt(process.env.DATA_RETENTION_DAYS ?? '30', 10),
  },
};

export function hasTavus(): boolean {
  return Boolean(config.tavus.apiKey || config.tavus.realtimeApiKey);
}

export function hasOpenAI(): boolean {
  return Boolean(config.openai.apiKey);
}

export function hasMaps(): boolean {
  return Boolean(config.maps.mapboxToken);
}
