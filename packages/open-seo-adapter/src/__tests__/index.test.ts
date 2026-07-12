import { describe, it, expect } from 'vitest';
import { name } from '../index.js';

describe('@seovista/open-seo-adapter', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/open-seo-adapter');
  });
});
