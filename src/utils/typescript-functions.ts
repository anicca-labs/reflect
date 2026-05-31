const typedKeys = <T extends object>(obj: T): (keyof T)[] =>
  Object.keys(obj) as (keyof T)[]

const typedValues = <T extends object>(obj: T): T[keyof T][] =>
  Object.values(obj) as T[keyof T][]

const typedEntries = <T extends object>(obj: T): [keyof T, T[keyof T]][] =>
  Object.entries(obj) as [keyof T, T[keyof T]][]

const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined

export { typedKeys, typedValues, typedEntries, isDefined }
