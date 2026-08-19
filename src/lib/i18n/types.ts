/** Widens the `as const` Arabic dictionary so other locales only have to match its shape. */
export type Translations<T> = {
  [K in keyof T]: T[K] extends string ? string : Translations<T[K]>;
};

/** Dotted key paths derived from the dictionary, so `t()` typos fail to compile. */
export type PathOf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${PathOf<T[K]>}`;
}[keyof T & string];
