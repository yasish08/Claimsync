import Redis from "ioredis";

let client;

export function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not configured.");
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => attempt > 2 ? null : attempt * 250
    });
    client.on("error", (error) => {
      if (process.env.NODE_ENV !== "test") console.error("Redis connection error:", error.message);
    });
  }
  return client;
}

export async function withRedis(operation) {
  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  if (redis.status !== "ready") throw new Error("Redis is not ready.");
  return operation(redis);
}

export async function enqueueClaim(claim) {
  return withRedis((redis) => redis.zadd("claimsync:priority-queue", claim.priorityScore, claim.id));
}

export async function removeClaimFromQueue(claimId) {
  return withRedis((redis) => redis.zrem("claimsync:priority-queue", claimId));
}
