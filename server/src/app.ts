import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase } from './db/index.js';
import { userRoutes } from './routes/user.js';
import { dropRoutes } from './routes/drop.js';
import { collectionRoutes } from './routes/collection.js';
import { avitaRoutes } from './routes/avita.js';
import { leaderboardRoutes } from './routes/leaderboard.js';

export async function buildApp(dbUrl?: string) {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Initialize DB schema and client
  await initDatabase(dbUrl);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  await app.register(userRoutes, { prefix: '/api/user' });
  await app.register(dropRoutes, { prefix: '/api/drop' });
  await app.register(collectionRoutes, { prefix: '/api/collection' });
  await app.register(avitaRoutes, { prefix: '/api/avita' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });

  // Serve static client assets in production if client/dist exists
  const possiblePaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ];
  const clientDist = possiblePaths.find((p) => fs.existsSync(p));

  if (clientDist) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
