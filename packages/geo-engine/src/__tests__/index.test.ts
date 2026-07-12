import { describe, it, expect } from 'vitest';
import { name } from '../index.js';

describe('@seovista/geo-engine', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/geo-engine');
  });
});
