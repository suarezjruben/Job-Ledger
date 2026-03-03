export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as T;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).reduce<Record<string, unknown>>((accumulator, [key, currentValue]) => {
      if (currentValue === undefined) {
        return accumulator;
      }

      accumulator[key] = stripUndefined(currentValue);
      return accumulator;
    }, {}) as T;
  }

  return value;
}

export function valueOrUndefined(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
