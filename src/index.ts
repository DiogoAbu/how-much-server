import 'reflect-metadata';
import '!/services/dotenv';
import '!/services/container';

import db from '!/services/db';
import server from '!/services/server';

void (async () => {
  if (!process.env.PORT || !process.env.SECRET_KEY) {
    console.log('[ERR] Environment variables not found, please setup your dotenv');
    process.exit(1);
  }

  await db();
  await server();
})();
