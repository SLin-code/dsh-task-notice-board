/**
 * CSS-modules ambient typing. Matches the shape lightningcss emits from
 * `x.module.css`: a default export whose keys are the local class names and
 * whose values are the hashed emitted class names. `Record<string, string>`
 * is the harness's own convention; under `noUncheckedIndexedAccess` each
 * `css.foo` read is `string | undefined`, and the callsite either bounces
 * that through `clsx` (harness style) or supplies a fallback.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
