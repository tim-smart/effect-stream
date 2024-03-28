/**
 * @since 1.0.0
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import type { LazyArg } from "effect/Function"
import { dual } from "effect/Function"
import * as Option from "effect/Option"
import type { Pipeable } from "effect/Pipeable"
import type * as Scope from "effect/Scope"
import type * as Types from "effect/Types"
import { Executor, rescueEOF } from "./internal/executor.js"
import * as Ops from "./internal/ops.js"

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Ops.TypeId

/**
 * @since 1.0.0
 * @category type ids
 */
export type TypeId = typeof TypeId

/**
 * @since 1.0.0
 * @category models
 */
export interface Channel<O, I = unknown, E = never, IE = unknown, R = never> extends Pipeable {
  readonly [Ops.TypeId]: {
    readonly _O: Types.Covariant<O>
    readonly _I: Types.Contravariant<I>
    readonly _E: Types.Covariant<E>
    readonly _IE: Types.Contravariant<IE>
    readonly _R: Types.Contravariant<R>
  }
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const read = <
  In,
  Out1,
  _In1,
  Err1,
  _InErr1,
  R1,
  InErr,
  Out2,
  _In2,
  Err2,
  _InErr2,
  R2,
  Out3,
  _In3,
  Err3,
  _InErr3,
  R3
>(
  onInput: (input: In) => Channel<Out1, _In1, Err1, _InErr1, R1>,
  onFailure: (
    cause: Cause.Cause<InErr>
  ) => Channel<Out2, _In2, Err2, _InErr2, R2>,
  onDone: () => Channel<Out3, _In3, Err3, _InErr3, R3>
): Channel<Out1 | Out2 | Out3, In, Err1 | Err2 | Err3, InErr, R1 | R2 | R3> =>
  new Ops.Read(onInput as any, onFailure as any, onDone as any) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const succeed = <O>(value: O): Channel<O> => new Ops.Success(value) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const empty: Channel<never> = Ops.constEmpty as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const never: Channel<never> = Ops.constNever as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const sync = <O>(evaluate: LazyArg<O>): Channel<O> => new Ops.Sync(evaluate) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const suspend = <O, I, E, IE, R>(
  evaluate: LazyArg<Channel<O, I, E, IE, R>>
): Channel<O, I, E, IE, R> => new Ops.Suspend(evaluate as any) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const failCause = <E>(
  cause: Cause.Cause<E>
): Channel<never, unknown, E> => new Ops.Failure(cause) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const fail = <E>(error: E): Channel<never, unknown, E> => failCause(Cause.fail(error))

/**
 * @since 1.0.0
 * @category constructors
 */
export const failCauseSync = <E>(
  cause: LazyArg<Cause.Cause<E>>
): Channel<never, unknown, E> => new Ops.FailSync(cause) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const failSync = <E>(error: LazyArg<E>): Channel<never, unknown, E> => failCauseSync(() => Cause.fail(error()))

/**
 * @since 1.0.0
 * @category constructors
 */
export const die = (defect: unknown): Channel<never> => failCause(Cause.die(defect))

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromEffect = <O, E, R>(
  effect: Effect.Effect<O, E, R>
): Channel<O, unknown, E, unknown, R> => new Ops.FromEffect(effect) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const acquireRelease = <O, E, R>(
  acquire: Effect.Effect<O, E, R>,
  release: (
    o: O,
    exit: Exit.Exit<unknown, unknown>
  ) => Effect.Effect<void, never, never>
): Channel<O, unknown, E, unknown, R> => new Ops.AcquireRelease(acquire, release) as any

/**
 * @since 1.0.0
 * @category repetition
 */
export const forever = <O, I, E, IE, R>(
  self: Channel<O, I, E, IE, R>
): Channel<O, I, E, IE, R> => {
  const cont: Ops.Continue = new Ops.Continue(
    self as any,
    new Ops.Suspend(() => cont)
  )
  return cont.fused() as any
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const repeatEffect = <O, E, R>(
  effect: Effect.Effect<O, E, R>
): Channel<O, unknown, E, unknown, R> => new Ops.RepeatEffect(effect) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const repeatEffectOption = <O, E, R>(
  effect: Effect.Effect<O, Option.Option<E>, R>
): Channel<O, unknown, E, unknown, R> => Ops.RepeatEffect.option(effect) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const repeatSync = <O>(evaluate: LazyArg<O>): Channel<O> => new Ops.RepeatEffect(Effect.sync(evaluate)) as any

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromIterable = <O>(iterable: Iterable<O>): Channel<O> =>
  suspend(() => {
    const iterator = iterable[Symbol.iterator]()
    return repeatEffectOption(
      Effect.suspend(() => {
        const result = iterator.next()
        return result.done
          ? Effect.fail(Option.none())
          : Effect.succeed(result.value)
      })
    )
  })

/**
 * @since 1.0.0
 * @category constructors
 */
export const range = (start: number, end?: number): Channel<number> =>
  end === undefined
    ? suspend(() => {
      let i = start
      return repeatEffect(Effect.sync(() => i++))
    })
    : suspend(() => {
      const actualEnd = start > end ? 1 : end - start + 1
      let i = start
      return repeatEffectOption(
        Effect.suspend(() => {
          const value = i++
          return value > actualEnd
            ? Effect.fail(Option.none())
            : Effect.succeed(value)
        })
      )
    })

/**
 * @since 1.0.0
 * @category mapping
 */
export const map: {
  <O, O2>(
    f: (o: NoInfer<O>) => O2
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O2, I, E, IE, R>
  <O, I, E, IE, R, O2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => O2
  ): Channel<O2, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R, O2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => O2
  ): Channel<O2, I, E, IE, R> => new Ops.Map(self as any, f).fused() as any
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const mapEffect: {
  <O, O2, E2, R2>(
    f: (o: NoInfer<O>) => Effect.Effect<O2, E2, R2>
  ): <I, E, IE, R>(
    self: Channel<O, I, E, IE, R>
  ) => Channel<O2, I, E | E2, IE, R | R2>
  <O, I, E, IE, R, O2, E2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: NoInfer<O>) => Effect.Effect<O2, E2, R2>
  ): Channel<O2, I, E | E2, IE, R | R2>
} = dual(
  2,
  <O, I, E, IE, R, O2, E2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: NoInfer<O>) => Effect.Effect<O2, E2, R2>
  ): Channel<O2, I, E | E2, IE, R | R2> => new Ops.OnSuccessEffect(self as any, f).fused() as any
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const filter: {
  <O, OB extends O>(
    f: (o: NoInfer<O>) => o is OB
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<OB, I, E, IE, R>
  <O>(
    f: (o: NoInfer<O>) => boolean
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O, I, E, IE, R>
  <O, I, E, IE, R, OB extends O>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => o is OB
  ): Channel<OB, I, E, IE, R>
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => boolean
  ): Channel<O, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => boolean
  ): Channel<O, I, E, IE, R> => new Ops.Filter(self as any, f).fused() as any
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const filterMap: {
  <O, OB>(
    f: (o: NoInfer<O>) => Option.Option<OB>
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<OB, I, E, IE, R>
  <O, I, E, IE, R, OB>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Option.Option<OB>
  ): Channel<OB, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R, OB>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Option.Option<OB>
  ): Channel<OB, I, E, IE, R> => new Ops.FilterMap(self as any, f).fused() as any
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const take: {
  (
    n: number
  ): <O, I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O, I, E, IE, R>
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    n: number
  ): Channel<O, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    n: number
  ): Channel<O, I, E, IE, R> => new Ops.Take(self as any, (_, i) => i < n).fused() as any
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const takeWhile: {
  <O, OB extends O>(
    predicate: (o: NoInfer<O>, i: number) => o is OB
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<OB, I, E, IE, R>
  <O>(
    predicate: (o: NoInfer<O>, i: number) => boolean
  ): <I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O, I, E, IE, R>
  <O, I, E, IE, R, OB extends O>(
    self: Channel<O, I, E, IE, R>,
    predicate: (o: NoInfer<O>, i: number) => o is OB
  ): Channel<OB, I, E, IE, R>
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    predicate: (o: NoInfer<O>, i: number) => boolean
  ): Channel<O, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    predicate: (o: NoInfer<O>, i: number) => boolean
  ): Channel<O, I, E, IE, R> => new Ops.Take(self as any, predicate).fused() as any
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const drop: {
  (
    n: number
  ): <O, I, E, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O, I, E, IE, R>
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    n: number
  ): Channel<O, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    n: number
  ): Channel<O, I, E, IE, R> => new Ops.Drop(self as any, (_, i) => i < n).fused() as any
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const flatMap: {
  <O, O2, I2, E2, IE2, R2>(
    f: (o: NoInfer<O>) => Channel<O2, I2, E2, IE2, R2>
  ): <I, E, IE, R>(
    self: Channel<O, I, E, IE, R>
  ) => Channel<O2, I, E | E2, IE, R | R2>
  <O, I, E, IE, R, O2, I2, E2, IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Channel<O2, I2, E2, IE2, R2>
  ): Channel<O2, I, E | E2, IE, R | R2>
} = dual(
  2,
  <O, I, E, IE, R, O2, I2, E2, IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Channel<O2, I2, E2, IE2, R2>
  ): Channel<O2, I, E | E2, IE, R | R2> => new Ops.OnSuccess(self as any, f as any).fused() as any
)

/**
 * @since 1.0.0
 * @category error handling
 */
export const catchCause: {
  <E, O2, I2, E2, IE2, R2>(
    f: (cause: Cause.Cause<NoInfer<E>>) => Channel<O2, I2, E2, IE2, R2>
  ): <O, I, IE, R>(
    self: Channel<O, I, E, IE, R>
  ) => Channel<O | O2, I, E2, IE, R | R2>
  <O, I, E, IE, R, O2, I2, E2, IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (cause: Cause.Cause<E>) => Channel<O2, I2, E2, IE2, R2>
  ): Channel<O | O2, I, E2, IE, R | R2>
} = dual(
  2,
  <O, I, E, IE, R, O2, I2, E2, IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (cause: Cause.Cause<E>) => Channel<O2, I2, E2, IE2, R2>
  ): Channel<O | O2, I, E2, IE, R | R2> => new Ops.OnFailure(self as any, f as any).fused() as any
)

/**
 * @since 1.0.0
 * @category resource management
 */
export const ensuring: {
  <E>(
    finalizer: (
      exit: Exit.Exit<void, NoInfer<E>>
    ) => Effect.Effect<void, never, never>
  ): <O, I, IE, R>(self: Channel<O, I, E, IE, R>) => Channel<O, I, E, IE, R>
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    finalizer: (
      exit: Exit.Exit<void, NoInfer<E>>
    ) => Effect.Effect<void, never, never>
  ): Channel<O, I, E, IE, R>
} = dual(
  2,
  <O, I, E, IE, R>(
    self: Channel<O, I, E, IE, R>,
    finalizer: (
      exit: Exit.Exit<NoInfer<O>, NoInfer<E>>
    ) => Effect.Effect<void, never, never>
  ): Channel<O, I, E, IE, R> => new Ops.Ensuring(self as any, finalizer).fused() as any
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const pipeTo: {
  <O2, I2, E2, IE2, R2>(
    that: Channel<O2, I2, E2, IE2, R2>
  ): <O extends I2, I, E extends IE2, IE, R>(
    self: Channel<O, I, E, IE, R>
  ) => Channel<O2, I, E2, IE, R | R2>
  <I, IE, R, O2, I2, O extends I2, E2, IE2, E extends IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    that: Channel<O2, I2, E2, IE2, R2>
  ): Channel<O2, I, E2, IE, R | R2>
} = dual(
  2,
  <I, IE, R, O2, I2, O extends I2, E2, IE2, E extends IE2, R2>(
    self: Channel<O, I, E, IE, R>,
    that: Channel<O2, I2, E2, IE2, R2>
  ): Channel<O2, I, E2, IE, R | R2> => new Ops.PipeTo(self as any, that as any).fused() as any
)

const makePull = <O, I, E, IE, R>(
  self: Channel<O, I, E, IE, R>
): Effect.Effect<Effect.Effect<O, E, R>, never, Scope.Scope> =>
  Effect.map(
    Effect.scope,
    (scope) => new Executor(self as any, scope).toPull() as any
  )

/**
 * @since 1.0.0
 * @category execution
 */
export const runForEach: {
  <O, E2, R2>(
    f: (o: NoInfer<O>) => Effect.Effect<void, E2, R2>
  ): <I, E, IE, R>(
    self: Channel<O, I, E, IE, R>
  ) => Effect.Effect<void, E | E2, R | R2>
  <O, I, E, IE, R, E2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Effect.Effect<void, E2, R2>
  ): Effect.Effect<void, E | E2, R | R2>
} = dual(
  2,
  <O, I, E, IE, R, E2, R2>(
    self: Channel<O, I, E, IE, R>,
    f: (o: O) => Effect.Effect<void, E2, R2>
  ): Effect.Effect<void, E | E2, R | R2> =>
    Effect.scoped(
      Effect.flatMap(makePull(self), (pull) =>
        Effect.catchAllCause(
          Effect.forever(Effect.flatMap(pull, f)),
          rescueEOF
        ))
    )
)

/**
 * @since 1.0.0
 * @category execution
 */
export const runCollect = <O, I, E, IE, R>(
  self: Channel<O, I, E, IE, R>
): Effect.Effect<Array<O>, E, R> =>
  Effect.suspend(() => {
    const out: Array<O> = []
    return Effect.as(
      runForEach(self, (o) => Effect.sync(() => out.push(o))),
      out
    )
  })

/**
 * @since 1.0.0
 * @category execution
 */
export const runDrain = <O, I, E, IE, R>(
  self: Channel<O, I, E, IE, R>
): Effect.Effect<void, E, R> =>
  Effect.scoped(
    Effect.flatMap(makePull(self), (pull) => Effect.catchAllCause(Effect.forever(pull), rescueEOF))
  )
