import { describe, it, expect } from 'vitest';

describe('nextg server', () => {
  it('has a server module that can be imported', async () => {
    const mod = await import('../server.js');
    expect(mod).toBeDefined();
    expect(typeof mod.startServer).toBe('function');
  });
});
