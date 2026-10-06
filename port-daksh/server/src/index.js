import { createApp } from './app.js';
import { getConfig, mongoHost } from './config.js';
import { createStore } from './store.js';

const config = getConfig();

if (!config.mongo.uri) {
  console.error('MONGODB_URI is not set (or is still the template value). Add your MongoDB connection string to server/.env — see server/.env.example.');
  process.exit(1);
}

const host = mongoHost(config.mongo.uri);
let store;
try {
  store = await createStore({ uri: config.mongo.uri, dbName: config.mongo.dbName }).init();
} catch (err) {
  console.error(`Could not connect to MongoDB at ${host} (database "${config.mongo.dbName}"): ${String(err.message).split('\n')[0]}`);
  console.error('Check the username and password, and — on MongoDB Atlas — that your IP address is on the Network Access list.');
  process.exit(1);
}

const app = await createApp({ store });
const server = app.listen(config.port, config.host, () => {
  console.log(`Waypoint API listening on http://${config.host}:${config.port}`);
  console.log(`  database: ${host} / ${config.mongo.dbName} (MongoDB)`);
  console.log(`  model:    ${config.ai.model} (Gemini)`);
  console.log(`  live:     ${config.live.model} (Gemini Live, voice ${config.live.voice}, ${config.live.targetMinutes} min target / ${config.live.maxMinutes} min limit)`);
  console.log(`  app url:  ${config.auth.appUrl} (password-reset links)${config.auth.smtp ? '' : ' — SMTP not configured: emails are printed here instead of sent'}`);
  if (!config.ai.apiKey) {
    console.warn('  ⚠ GEMINI_API_KEY is not set (or is still the placeholder) — AI features will return an error until it is. See server/.env.example.');
  }
});

// Finish in-flight requests, then close the database connection.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    app.closeLive().catch(() => {}); // keep every live transcript, then let connections end
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
