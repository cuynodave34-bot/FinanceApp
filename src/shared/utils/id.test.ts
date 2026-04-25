import { createId } from './id';

describe('createId', () => {
  it('generates a valid v4 UUID format', () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('generates unique values across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, createId));
    expect(ids.size).toBe(100);
  });
});
