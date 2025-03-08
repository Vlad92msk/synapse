export class StorageKey {
  constructor(
    private readonly value: string,
    private readonly isRawKey: boolean = false,
  ) {}

  toString(): string {
    return this.value
  }

  toJSON(): string {
    return this.value
  }

  valueOf(): string {
    return this.value
  }

  isUnparseable(): boolean {
    return this.isRawKey
  }
}

// Тип, который может быть либо строкой, либо StorageKey
export type StorageKeyType = string | StorageKey
