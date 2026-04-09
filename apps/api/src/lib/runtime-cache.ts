type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const valueCache = new Map<string, CacheEntry<unknown>>();
const inflightCache = new Map<string, Promise<unknown>>();

export async function getOrPopulateRuntimeCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  if (ttlMs <= 0) {
    return loader();
  }

  const now = Date.now();
  const cached = valueCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inflight = inflightCache.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const promise = loader()
    .then((value) => {
      valueCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      return value;
    })
    .finally(() => {
      inflightCache.delete(key);
    });

  inflightCache.set(key, promise);
  return promise;
}

export function invalidateRuntimeCache(prefix?: string) {
  if (!prefix) {
    valueCache.clear();
    inflightCache.clear();
    return;
  }

  for (const key of valueCache.keys()) {
    if (key.startsWith(prefix)) {
      valueCache.delete(key);
    }
  }

  for (const key of inflightCache.keys()) {
    if (key.startsWith(prefix)) {
      inflightCache.delete(key);
    }
  }
}
