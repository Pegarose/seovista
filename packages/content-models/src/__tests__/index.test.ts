import { describe, it, expect } from 'vitest';
import { name } from '../index.js';

describe('@seovista/content-models', () => {
  it('exports a defined package name', () => {
    expect(name).toBe('@seovista/content-models');
  });
});
