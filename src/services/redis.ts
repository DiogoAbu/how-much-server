import Redis from 'ioredis';

export const tokenRedis = new Redis(`${process.env.REDIS_URL!}/0`);

export async function quitAll(): Promise<void> {
  await tokenRedis.quit();
}
