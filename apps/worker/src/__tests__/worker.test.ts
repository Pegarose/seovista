import { describe, it, expect } from 'vitest';

describe('@seovista/worker', () => {
  it('exports a defined worker module', async () => {
    const mod = await import('../worker.js');
    expect(mod).toBeDefined();
    expect(mod.workerName).toBe('@seovista/worker');
  });
});
