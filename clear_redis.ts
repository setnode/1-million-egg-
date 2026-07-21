import { redis } from './src/services/redis';

async function main() {
  if (redis) {
    await redis.del('v1:home:global');
    console.log('Cleared v1:home:global cache');
  }
}
main().catch(console.error);
