type PrivateClientCleanup = () => void | Promise<void>;

const cleanups = new Set<PrivateClientCleanup>();

export function registerPrivateClientCleanup(cleanup: PrivateClientCleanup) {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

export async function runRegisteredPrivateClientCleanups() {
  await Promise.all([...cleanups].map(async (cleanup) => cleanup()).map((cleanup) => cleanup.catch(() => undefined)));
}
