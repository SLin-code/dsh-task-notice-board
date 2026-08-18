/**
 * CSS-modules ambient typing. The client bundle compiles `.module.css` through
 * lightningcss, turning each file into `default: Record<string, string>` where
 * every key is a local class and every value is its hashed emitted class name.
 * The `.d.ts` here keeps `tsc --noEmit` happy without generating one file per
 * stylesheet.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
