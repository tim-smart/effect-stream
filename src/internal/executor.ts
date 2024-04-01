import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as ExecutionStrategy from "effect/ExecutionStrategy"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import * as Ops from "./ops.js"

const EOF = Symbol.for("effect/Channel/EOF")
export const dieEOF = Effect.die(EOF)

/** @internal */
export const isEOFCause = <E>(cause: Cause.Cause<E>): cause is Cause.Die & {
  readonly defect: typeof EOF
} => cause._tag === "Die" && cause.defect === EOF

/** @internal */
export const rescueEOF = <E>(
  cause: Cause.Cause<E>
): Effect.Effect<void, E, never> => {
  if (isEOFCause(cause)) {
    return Effect.unit
  }
  return Effect.failCause(cause)
}

/** @internal */
export class Executor {
  constructor(
    readonly seed: Ops.Operation,
    readonly scope: Scope.Scope
  ) {}

  input: Effect.Effect<unknown, unknown, unknown> = dieEOF

  evaluate(op: Ops.Operation): Effect.Effect<unknown, unknown, unknown> {
    if (typeof op === "object" && op !== null && Ops.TypeId in op) {
      return this[op._op](op as any)
    }
    throw new Error(`absurd: expected a Channel Operation, got ${op}`)
  }

  Read(op: Ops.Read): Effect.Effect<unknown, unknown, unknown> {
    let currentEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    return Effect.suspend(() => {
      if (currentEffect !== undefined) {
        return currentEffect
      }
      return Effect.matchCauseEffect(this.input, {
        onSuccess: (a) => {
          currentEffect = this.evaluate(op.onInput(a))
          return currentEffect
        },
        onFailure: (cause) => {
          currentEffect = this.evaluate(isEOFCause(cause) ? op.onDone() : op.onFailure(cause))
          return currentEffect
        }
      })
    })
  }
  Empty(_op: Ops.Empty): Effect.Effect<unknown, unknown, unknown> {
    return dieEOF
  }
  Never(_op: Ops.Never): Effect.Effect<unknown, unknown, unknown> {
    return Effect.never
  }
  Success(op: Ops.Success): Effect.Effect<unknown, unknown, unknown> {
    let emitted = false
    return Effect.suspend(() => {
      if (emitted) {
        return dieEOF
      }
      emitted = true
      return Effect.succeed(op.value)
    })
  }
  FromEffect(op: Ops.FromEffect): Effect.Effect<unknown, unknown, unknown> {
    let emitted = false
    return Effect.suspend(() => {
      if (emitted) {
        return dieEOF
      }
      emitted = true
      return op.effect
    })
  }
  RepeatEffect(op: Ops.RepeatEffect): Effect.Effect<unknown, unknown, unknown> {
    return op.effect
  }
  RepeatOption(op: Ops.RepeatOption): Effect.Effect<unknown, unknown, unknown> {
    return Effect.suspend(() => {
      const value = op.evaluate()
      return value._tag === "Some" ? Effect.succeed(value.value) : dieEOF
    })
  }
  Sync(op: Ops.Sync): Effect.Effect<unknown, unknown, unknown> {
    let emitted = false
    return Effect.suspend(() => {
      if (emitted) {
        return dieEOF
      }
      emitted = true
      return Effect.sync(op.evaluate)
    })
  }
  Suspend(op: Ops.Suspend): Effect.Effect<unknown, unknown, unknown> {
    let currentEffect: Effect.Effect<unknown, unknown, unknown>
    return Effect.suspend(() => {
      if (currentEffect === undefined) {
        currentEffect = this.evaluate(op.evaluate())
      }
      return currentEffect
    })
  }
  Failure(op: Ops.Failure): Effect.Effect<unknown, unknown, unknown> {
    return Effect.failCause(op.cause)
  }
  FailSync(op: Ops.FailSync): Effect.Effect<unknown, unknown, unknown> {
    return Effect.failCauseSync(op.evaluate)
  }
  Continue(op: Ops.Continue): Effect.Effect<unknown, unknown, unknown> {
    let currentEffect: Effect.Effect<unknown, unknown, unknown> = Effect.catchAllCause(
      this.evaluate(op.upstream),
      (cause) => {
        if (!isEOFCause(cause)) {
          return Effect.failCause(cause)
        }
        currentEffect = this.evaluate(op.next)
        return currentEffect
      }
    )
    return Effect.suspend(() => currentEffect)
  }
  Map(op: Ops.Map): Effect.Effect<unknown, unknown, unknown> {
    return Effect.map(this.evaluate(op.upstream), op.transform)
  }
  Filter(op: Ops.Filter): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    const loop: Effect.Effect<unknown, unknown, unknown> = Effect.flatMap(
      upstreamEffect,
      (value) => {
        if (op.predicate(value)) {
          return Effect.succeed(value)
        }
        return loop
      }
    )
    return loop
  }
  FilterMap(op: Ops.FilterMap): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    const loop: Effect.Effect<unknown, unknown, unknown> = Effect.flatMap(
      upstreamEffect,
      (value) => {
        const o = op.predicate(value)
        if (o._tag === "Some") {
          return Effect.succeed(o.value)
        }
        return loop
      }
    )
    return loop
  }
  Take(op: Ops.Take): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let i = 0
    return Effect.flatMap(upstreamEffect, (value) => {
      const pass = op.predicate(value, i++)
      return pass ? Effect.succeed(value) : dieEOF
    })
  }
  Drop(op: Ops.Drop): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let i = 0
    let dropping = true
    const loop: Effect.Effect<unknown, unknown, unknown> = Effect.flatMap(
      upstreamEffect,
      (value) => {
        dropping = op.predicate(value, i++)
        return dropping ? loop : Effect.succeed(value)
      }
    )
    return Effect.suspend(() => (dropping ? loop : upstreamEffect))
  }
  OnSuccess(op: Ops.OnSuccess): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let downstreamEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    const loop: Effect.Effect<unknown, unknown, unknown> = Effect.suspend(
      () => {
        if (downstreamEffect !== undefined) {
          return downstreamEffect
        }
        return Effect.flatMap(upstreamEffect, (value) => {
          downstreamEffect = Effect.catchAllCause(
            this.evaluate(op.onSuccess(value)),
            (cause) => {
              if (!isEOFCause(cause)) {
                return Effect.failCause(cause)
              }
              downstreamEffect = undefined
              return loop
            }
          )
          return downstreamEffect
        })
      }
    )
    return loop
  }
  OnSuccessEffect(
    op: Ops.OnSuccessEffect
  ): Effect.Effect<unknown, unknown, unknown> {
    return Effect.flatMap(this.evaluate(op.upstream), op.onSuccess)
  }
  OnSuccessChunkEffect(
    op: Ops.OnSuccessChunkEffect
  ): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let currentChunk: Array<unknown> | undefined
    let i = 0
    const onSuccess = (o: unknown) => Effect.map(op.onSuccess(o), (b) => [b])
    const loop: Effect.Effect<Array<unknown>, unknown, unknown> = Effect.suspend(() => {
      if (currentChunk !== undefined) {
        if (i >= currentChunk.length) {
          currentChunk = undefined
          i = 0
          return loop
        }
        const value = currentChunk[i++]
        return onSuccess(value)
      }
      return Effect.flatMap(upstreamEffect, (chunk) => {
        currentChunk = chunk as any
        return loop
      })
    })
    return loop
  }
  WithPull(op: Ops.WithPull): Effect.Effect<unknown, unknown, unknown> {
    const semaphore = Effect.unsafeMakeSemaphore(1)
    const upstreamEffect = semaphore.withPermits(1)(this.evaluate(op.upstream))
    return this.evaluate(op.withPull(upstreamEffect))
  }
  OnFailure(op: Ops.OnFailure): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let downstreamEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    return Effect.suspend(() => {
      if (downstreamEffect !== undefined) {
        return downstreamEffect
      }
      return Effect.catchAllCause(upstreamEffect, (cause) => {
        if (isEOFCause(cause)) {
          return dieEOF
        }
        downstreamEffect = this.evaluate(op.onFailure(cause))
        return downstreamEffect
      })
    })
  }
  OnFailureEffect(
    op: Ops.OnFailureEffect
  ): Effect.Effect<unknown, unknown, unknown> {
    return Effect.catchAllCause(this.evaluate(op.upstream), (cause) => {
      if (isEOFCause(cause)) {
        return dieEOF
      }
      return op.onFailure(cause)
    })
  }
  OnSuccessOrFailure(
    op: Ops.OnSuccessOrFailure
  ): Effect.Effect<unknown, unknown, unknown> {
    const upstreamEffect = this.evaluate(op.upstream)
    let downstreamEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    const loop: Effect.Effect<unknown, unknown, unknown> = Effect.suspend(
      () => {
        if (downstreamEffect !== undefined) {
          return downstreamEffect
        }
        return Effect.matchCauseEffect(upstreamEffect, {
          onSuccess: (value) => {
            downstreamEffect = Effect.catchAllCause(
              this.evaluate(op.onSuccess(value)),
              (cause) => {
                if (!isEOFCause(cause)) {
                  return Effect.failCause(cause)
                }
                downstreamEffect = undefined
                return loop
              }
            )
            return downstreamEffect
          },
          onFailure: (cause) => {
            if (isEOFCause(cause)) {
              return dieEOF
            }
            downstreamEffect = this.evaluate(op.onFailure(cause))
            return downstreamEffect
          }
        })
      }
    )
    return loop
  }
  AcquireRelease(
    op: Ops.AcquireRelease
  ): Effect.Effect<unknown, unknown, unknown> {
    let emitted = false
    return Effect.suspend(() => {
      if (emitted) {
        return dieEOF
      }
      emitted = true
      return Effect.uninterruptible(
        Effect.tap(op.acquire, (a) => Scope.addFinalizerExit(this.scope, (exit) => op.release(a, exit)))
      )
    })
  }
  Ensuring(op: Ops.Ensuring): Effect.Effect<unknown, unknown, unknown> {
    let upstreamEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    return Effect.suspend(() => {
      if (upstreamEffect !== undefined) {
        return upstreamEffect
      }
      return Effect.flatMap(
        Scope.fork(this.scope, ExecutionStrategy.sequential),
        (scope) => {
          const effect = this.evaluate(op.upstream)
          upstreamEffect = Effect.uninterruptibleMask((restore) =>
            Effect.catchAllCause(restore(effect), (cause) =>
              Effect.zipRight(
                Scope.close(
                  scope,
                  isEOFCause(cause) ? Exit.unit : Exit.failCause(cause)
                ),
                Effect.failCause(cause)
              ))
          )
          return Effect.uninterruptibleMask((restore) =>
            Effect.zipRight(
              Scope.addFinalizerExit(scope, op.finalizer),
              restore(upstreamEffect!)
            )
          )
        }
      )
    })
  }
  Unwrap(op: Ops.Unwrap): Effect.Effect<unknown, unknown, unknown> {
    let currentEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    return Effect.suspend(() => {
      if (currentEffect !== undefined) {
        return currentEffect
      }
      return Effect.flatMap(Scope.extend(op.effect, this.scope), (op) => {
        currentEffect = this.evaluate(op)
        return currentEffect
      })
    })
  }
  PipeTo(op: Ops.PipeTo): Effect.Effect<unknown, unknown, unknown> {
    let downstreamEffect: Effect.Effect<unknown, unknown, unknown> | undefined
    return Effect.suspend(() => {
      if (downstreamEffect !== undefined) {
        return downstreamEffect
      }
      return Effect.flatMap(this.subExecutorPull(op.upstream), (pull) => {
        this.input = pull
        downstreamEffect = this.evaluate(op.downstream)
        return downstreamEffect
      })
    })
  }
  EmbedInput(op: Ops.EmbedInput): Effect.Effect<unknown, unknown, unknown> {
    const input = op.input
    const output = this.evaluate(op.output)
    const fork = Effect.interruptible(Effect.forkIn(
      Effect.forever(Effect.matchCauseEffect(this.input, {
        onFailure: (cause) => isEOFCause(cause) ? input.onDone() : input.onFailure(cause),
        onSuccess: (value) => input.onInput(value)
      })),
      this.scope
    ))

    let emitted = false
    return Effect.suspend(() => {
      if (emitted) {
        return output
      }
      emitted = true
      return Effect.zipRight(fork, output)
    })
  }

  subExecutorPull(
    op: Ops.Operation
  ): Effect.Effect<Effect.Effect<unknown, unknown, unknown>, never, never> {
    return Effect.map(
      Scope.fork(this.scope, ExecutionStrategy.sequential),
      (scope) => {
        const pull = new Executor(op, scope).toPull()
        return Effect.uninterruptibleMask((restore) =>
          Effect.catchAllCause(restore(pull), (cause) =>
            Effect.zipRight(
              Scope.close(
                scope,
                isEOFCause(cause) ? Exit.unit : Exit.failCause(cause)
              ),
              Effect.failCause(cause)
            ))
        )
      }
    )
  }

  _pullEffect: Effect.Effect<unknown, unknown, unknown> | undefined
  toPull(): Effect.Effect<unknown, unknown, unknown> {
    return this.evaluate(this.seed)
  }
}
