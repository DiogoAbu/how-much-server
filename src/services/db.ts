import { Connection, createConnection } from 'typeorm';

import entities from '!/entities';
import debug from '!/services/debug';

const { DATABASE_URL, TYPEORM_SSL, TYPEORM_DROP, TYPEORM_SYNC } = process.env;

const log = debug.extend('db');

// When synchronize is true data that use columns that were
// removed will be dropped, leading to the loss of data.
export default async (): Promise<Connection> => {
  const connection = await createConnection({
    type: 'postgres',
    url: DATABASE_URL,
    ssl: TYPEORM_SSL === 'true',
    cache: true,
    dropSchema: TYPEORM_DROP === 'true',
    entities,
    logging: process.env.NODE_ENV !== 'production' ? 'all' : ['error', 'warn'],
    logger: 'debug',
    synchronize: TYPEORM_SYNC === 'true',
    migrationsRun: true,
    migrations: ['migration/*.js'],
    cli: {
      migrationsDir: 'migration',
    },
  });

  log('connected');

  return connection;
};
