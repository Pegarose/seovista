import { describe, it, expect } from 'vitest';
import { name } from '../index.js';

describe('@seovista/seo-core', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/seo-core');
  });
});
