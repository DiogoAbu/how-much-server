import 'reflect-metadata';
import '!/services/dotenv';
import '!/services/container';

import throng from 'throng';

const WORKERS = parseInt(process.env.WEB_CONCURRENCY ?? '1', 10);

async function start() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('!/services/db').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const server = require('!/services/server').default;

  if (!process.env.PORT || !process.env.TOKEN_SECRET_KEY) {
    console.log('[ERR] Environment variables not found, please setup your dotenv');
    process.exit(1);
  }

  await db();
  await server();
}

if (process.env.NODE_ENV !== 'production') {
  void start();
} else {
  throng({
    worker: start,
    count: WORKERS,
    lifetime: Infinity,
  });
}
