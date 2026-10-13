import { buildApp } from './app.js';
import { CONFIG } from './config.js';

async function start() {
  try {
    const app = await buildApp();
    const address = await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
    console.log(`[NickDrop Server] Running on ${address}`);
  } catch (err) {
    console.error('[NickDrop Server] Failed to start:', err);
    process.exit(1);
  }
}

start();
