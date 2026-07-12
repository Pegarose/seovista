import { describe, it, expect } from 'vitest';
import { name } from '../index.js';

describe('@seovista/dataforseo', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/dataforseo');
  });
});
