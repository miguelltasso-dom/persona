import { valueMap } from '@deepseek-ai/cosmokit'

type EvaluateFn = (ctx: object, expr: string) => unknown

let compiled: EvaluateFn | undefined

/**
 * Compile the `!!js` evaluator. Lazy: a top-level `new Function` is a CSP
 * `unsafe-eval` violation in the desktop renderer (Persona `#root` empty).
 * @returns Host evaluator. The renderer never reaches this on boot.
 */
function compileEvaluate(): EvaluateFn {
  return new Function('ctx', 'expr', `
  with (ctx) {
    return eval(expr)
  }
`) as EvaluateFn
}

/**
 * Evaluate a JavaScript expression against a loader context scope.
 * Built on first `!!js` node, never at import (desktop CSP).
 * @param ctx - Loader context (`with (ctx)` scope).
 * @param expr - Expression text from a `!!js` node.
 * @returns The value of `expr` in `ctx`.
 */
export function evaluate(ctx: object, expr: string): unknown {
  compiled ??= compileEvaluate()
  return compiled(ctx, expr)
}

/** Recursively replace YAML `!!js` expression nodes with evaluated values. */
export function interpolate(ctx: object, value: any) {
  if (isJsExpr(value)) {
    return evaluate(ctx, value.__jsExpr)
  } else if (!value || typeof value !== 'object') {
    return value
  } else if (Array.isArray(value)) {
    return value.map(item => interpolate(ctx, item))
  } else {
    return valueMap(value, item => interpolate(ctx, item))
  }
}

/** Return true when a value is a serialized loader JavaScript expression. */
export function isJsExpr(value: any): value is JsExpr {
  return value instanceof Object && '__jsExpr' in value
}

/** Serialized JavaScript expression produced by the include YAML tag. */
export interface JsExpr {
  __jsExpr: string
}
