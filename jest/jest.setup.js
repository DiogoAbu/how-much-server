if (!process.env.SECRET_KEY) {
  process.env.SECRET_KEY = '1arl43AIkyaOdvr2v35G2Y6tJlFbco8YoVSEgCNGBzw';
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:password@localhost:4321/howmuchtest';
}
if (!process.env.TYPEORM_SSL) {
  process.env.TYPEORM_SSL = 'false';
}
if (!process.env.TYPEORM_DROP) {
  process.env.TYPEORM_DROP = 'true';
}
if (!process.env.TYPEORM_SYNC) {
  process.env.TYPEORM_SYNC = 'true';
}

global.startServer = async () => {
  const startServer = require('../src/services/server').default;
  const { server, url } = await startServer();
  global.server = server;
  global.serverUrl = url;
};

global.startDb = async () => {
  const startDb = require('../src/services/db').default;
  global.db = await startDb();
  await global.db.synchronize(true);
};
