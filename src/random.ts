export type RandomSource = {
  next(): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  int(min: number, max: number): number;
};

export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return items[Math.floor(this.next() * items.length)]!;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

export class SeededRandomSource implements RandomSource {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return items[Math.floor(this.next() * items.length)]!;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}
