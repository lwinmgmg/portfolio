declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect<T>(value: T): {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toThrow(): void;
    toContain(expected: unknown): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
    not: {
      toBe(expected: T): void;
      toContain(expected: unknown): void;
      toHaveProperty(key: string): void;
    };
    rejects: {
      toBeInstanceOf(expected: unknown): Promise<void>;
      toMatchObject(expected: unknown): Promise<void>;
    };
  };
}
