import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import type { LazyArg } from "effect/Function"
import * as Option from "effect/Option"
import { pipeArguments } from "effect/Pipeable"
import type * as Channel from "../Channel.js"

/** @internal */
export const TypeId: Channel.TypeId = Symbol.for("effect/Channel") as Channel.TypeId

/** @internal */
export type TypeId = typeof TypeId

/** @internal */
export type Operation =
  | Read
  | Empty
  | Never
  | Success
  | FromEffect
  | RepeatEffect
  | RepeatOption
  | Sync
  | Suspend
  | Failure
  | FailSync
  | Continue
  | Map
  | Filter
  | FilterMap
  | Take
  | Drop
  | OnSuccess
  | OnSuccessEffect
  | OnSuccessChunkEffect
  | OnFailure
  | OnFailureEffect
  | OnSuccessOrFailure
  | PipeTo
  | EmbedInput
  | AcquireRelease
  | Ensuring

/** @internal */
export type TransformOp = Extract<Operation, { readonly upstream: Operation }>

/** @internal */
export declare namespace Operation {
  /** @internal */
  export interface Proto {
    readonly [TypeId]: TypeId
    readonly _op: string
    optimize(downstream: TransformOp): Operation
  }

  /** @internal */
  export interface TransformProto extends Proto {
    readonly upstream: Operation
    /** @internal */
    fused(): Operation
  }
}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  },
  optimize(downstream: TransformOp): Operation {
    return downstream
  }
}
const TransformProto = {
  ...Proto,
  fused(this: TransformOp) {
    return this.upstream.optimize(this)
  }
}

function Base<Op extends string>(
  op: Op
): new() => Operation.Proto & {
  readonly _op: Op
} {
  function Base() {}
  Object.assign(Base.prototype, Proto, { _op: op })
  return Base as any
}

function BaseTransform<Op extends string>(
  op: Op
): new(upstream: Operation) => Operation.TransformProto & {
  readonly _op: Op
} {
  function Base(this: any, upstream: Operation) {
    this.upstream = upstream
  }
  Object.assign(Base.prototype, TransformProto, {
    _op: op
  })
  return Base as any
}

const EOF = Symbol.for("effect/Channel/EOF")
const dieEmpty = Effect.die(EOF)

/** @internal */
export class Read extends Base("Read") {
  constructor(
    readonly onInput: (input: unknown) => Operation,
    readonly onFailure: (cause: Cause.Cause<unknown>) => Operation,
    readonly onDone: () => Operation
  ) {
    super()
  }
}

/** @internal */
export class Empty extends Base("Empty") {
  constructor() {
    super()
  }

  optimize(_downstream: TransformOp): Operation {
    return this
  }
}
/** @internal */
export const constEmpty = new Empty()

/** @internal */
export class Never extends Base("Never") {
  constructor() {
    super()
  }

  optimize(_downstream: TransformOp): Operation {
    return this
  }
}
/** @internal */
export const constNever = new Never()

/** @internal */
export class Success extends Base("Success") {
  constructor(readonly value: unknown) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Map": {
        const transform = downstream.transform
        return new Sync(() => transform(this.value))
      }
      case "Filter": {
        const predicate = downstream.predicate
        return new Suspend(() => (predicate(this.value) ? this : constEmpty))
      }
      case "FilterMap": {
        const predicate = downstream.predicate
        return new Suspend(() => {
          const o = predicate(this.value)
          return o._tag === "Some" ? new Success(o.value) : constEmpty
        })
      }
      case "OnSuccess": {
        return new Suspend(() => downstream.onSuccess(this.value))
      }
      case "OnSuccessEffect": {
        return new FromEffect(
          Effect.suspend(() => downstream.onSuccess(this.value))
        )
      }
      case "OnSuccessOrFailure": {
        return new Suspend(() => downstream.onSuccess(this.value))
      }
      case "OnFailureEffect":
      case "OnFailure": {
        return this
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class FromEffect extends Base("FromEffect") {
  constructor(readonly effect: Effect.Effect<unknown, unknown, unknown>) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnSuccessEffect": {
        return new FromEffect(Effect.flatMap(this.effect, downstream.onSuccess))
      }
      case "OnFailureEffect": {
        return new FromEffect(
          Effect.catchAllCause(this.effect, downstream.onFailure)
        )
      }
      case "Map": {
        return new FromEffect(Effect.map(this.effect, downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class RepeatEffect extends Base("RepeatEffect") {
  constructor(readonly effect: Effect.Effect<unknown, unknown, unknown>) {
    super()
  }

  static option(
    effect: Effect.Effect<unknown, Option.Option<unknown>, unknown>
  ): Operation {
    return new RepeatEffect(
      Effect.catchAll(effect, (o) => {
        if (o._tag === "Some") {
          return Effect.fail(o.value)
        }
        return dieEmpty
      })
    )
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnSuccessEffect": {
        return new RepeatEffect(Effect.flatMap(this.effect, downstream.onSuccess))
      }
      case "OnFailureEffect": {
        return new RepeatEffect(
          Effect.catchAllCause(this.effect, downstream.onFailure)
        )
      }
      case "Map": {
        return new RepeatEffect(Effect.map(this.effect, downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class RepeatOption extends Base("RepeatOption") {
  constructor(readonly evaluate: LazyArg<Option.Option<unknown>>) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Map": {
        return new RepeatOption(() => Option.map(this.evaluate(), downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class Sync extends Base("Sync") {
  constructor(readonly evaluate: () => unknown) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Map": {
        const transform = downstream.transform
        return new Sync(() => transform(this.evaluate()))
      }
      case "Filter": {
        const predicate = downstream.predicate
        return new Suspend(() => predicate(this.evaluate()) ? this : constEmpty)
      }
      case "FilterMap": {
        const predicate = downstream.predicate
        return new Suspend(() => {
          const o = predicate(this.evaluate())
          return o._tag === "Some" ? new Success(o.value) : constEmpty
        })
      }
      case "OnSuccess": {
        return new Suspend(() => downstream.onSuccess(this.evaluate()))
      }
      case "OnSuccessEffect": {
        return new FromEffect(
          Effect.suspend(() => downstream.onSuccess(this.evaluate()))
        )
      }
      case "OnSuccessOrFailure": {
        return new Suspend(() => {
          try {
            return downstream.onSuccess(this.evaluate())
          } catch (defect) {
            return downstream.onFailure(Cause.die(defect))
          }
        })
      }
      case "OnFailureEffect": {
        return new FromEffect(
          Effect.catchAllCause(
            Effect.sync(this.evaluate),
            downstream.onFailure
          )
        )
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class Suspend extends Base("Suspend") {
  constructor(readonly evaluate: () => Operation) {
    super()
  }
}

/** @internal */
export class Failure extends Base("Failure") {
  constructor(readonly cause: Cause.Cause<unknown>) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnFailure":
      case "OnSuccessOrFailure": {
        return new Suspend(() => downstream.onFailure(this.cause))
      }
      case "OnFailureEffect": {
        return new FromEffect(
          Effect.suspend(() => downstream.onFailure(this.cause))
        )
      }
      case "PipeTo": {
        return downstream
      }
      default: {
        return this
      }
    }
  }
}

/** @internal */
export class FailSync extends Base("FailSync") {
  constructor(readonly evaluate: () => Cause.Cause<unknown>) {
    super()
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnFailure":
      case "OnSuccessOrFailure": {
        return new Suspend(() => downstream.onFailure(this.evaluate()))
      }
      case "OnFailureEffect": {
        return new FromEffect(
          Effect.suspend(() => downstream.onFailure(this.evaluate()))
        )
      }
      case "PipeTo": {
        return downstream
      }
      default: {
        return this
      }
    }
  }
}

/** @internal */
export class Continue extends BaseTransform("Continue") {
  constructor(
    upstream: Operation,
    readonly next: Operation
  ) {
    super(upstream)
  }
}

/** @internal */
export class Map extends BaseTransform("Map") {
  constructor(
    upstream: Operation,
    readonly transform: (a: any) => unknown
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Filter": {
        const predicate = downstream.predicate
        const transform = this.transform
        return new Filter(this.upstream, (a) => predicate(transform(a)))
      }
      case "FilterMap": {
        const predicate = downstream.predicate
        const transform = this.transform
        return new FilterMap(this.upstream, (a) => predicate(transform(a)))
      }
      case "Map": {
        const transform = this.transform
        return new Map(this.upstream, (a) => downstream.transform(transform(a)))
      }
      case "OnSuccess": {
        const transform = this.transform
        return new OnSuccess(this.upstream, (a) => downstream.onSuccess(transform(a)))
      }
      case "OnSuccessEffect": {
        const transform = this.transform
        return new OnSuccessEffect(this.upstream, (a) => downstream.onSuccess(transform(a)))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class Filter extends BaseTransform("Filter") {
  constructor(
    upstream: Operation,
    readonly predicate: (a: any) => boolean
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Filter": {
        const predicate = this.predicate
        return new Filter(
          this.upstream,
          (a) => predicate(a) && downstream.predicate(a)
        )
      }
      case "FilterMap": {
        const predicate = this.predicate
        return new FilterMap(this.upstream, (a) => predicate(a) ? downstream.predicate(Option.some(a)) : Option.none())
      }
      case "Map": {
        const predicate = this.predicate
        return new FilterMap(this.upstream, (a) => predicate(a) ? Option.some(downstream.transform(a)) : Option.none())
      }
      case "OnSuccess": {
        const predicate = this.predicate
        return new OnSuccess(this.upstream, (a) => predicate(a) ? downstream.onSuccess(a) : constEmpty)
      }
      case "OnSuccessEffect": {
        const predicate = this.predicate
        return new OnSuccess(this.upstream, (a) => predicate(a) ? new FromEffect(downstream.onSuccess(a)) : constEmpty)
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class FilterMap extends BaseTransform("FilterMap") {
  constructor(
    upstream: Operation,
    readonly predicate: (a: any) => Option.Option<unknown>
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Filter": {
        const predicate = this.predicate
        return new FilterMap(this.upstream, (a) => Option.filter(predicate(a), downstream.predicate))
      }
      case "FilterMap": {
        const predicate = this.predicate
        return new FilterMap(this.upstream, (a) => Option.flatMap(predicate(a), downstream.predicate))
      }
      case "Map": {
        const predicate = this.predicate
        return new FilterMap(this.upstream, (a) => Option.map(predicate(a), downstream.transform))
      }
      case "OnSuccess": {
        const predicate = this.predicate
        return new OnSuccess(this.upstream, (a) => {
          const o = predicate(a)
          return o._tag === "Some" ? downstream.onSuccess(o.value) : constEmpty
        })
      }
      case "OnSuccessEffect": {
        const predicate = this.predicate
        return new OnSuccess(this.upstream, (a) => {
          const o = predicate(a)
          return o._tag === "Some"
            ? new FromEffect(downstream.onSuccess(o.value))
            : constEmpty
        })
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class OnSuccess extends BaseTransform("OnSuccess") {
  constructor(
    upstream: Operation,
    readonly onSuccess: (a: any) => Operation
  ) {
    super(upstream)
  }
}

/** @internal */
export class OnSuccessEffect extends BaseTransform("OnSuccessEffect") {
  constructor(
    upstream: Operation,
    readonly onSuccess: (a: any) => Effect.Effect<unknown, unknown, unknown>
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnSuccessEffect": {
        const onSuccess = this.onSuccess
        return new OnSuccessEffect(this.upstream, (a) => Effect.flatMap(onSuccess(a), downstream.onSuccess))
      }
      case "Map": {
        return new OnSuccessEffect(this.upstream, (a) => Effect.map(this.onSuccess(a), downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class OnSuccessChunkEffect extends BaseTransform("OnSuccessChunkEffect") {
  constructor(
    upstream: Operation,
    readonly onSuccess: (a: any) => Effect.Effect<unknown, unknown, unknown>
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnSuccessEffect": {
        const onSuccess = this.onSuccess
        return new OnSuccessEffect(this.upstream, (a) => Effect.flatMap(onSuccess(a), downstream.onSuccess))
      }
      case "Map": {
        return new OnSuccessEffect(this.upstream, (a) => Effect.map(this.onSuccess(a), downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class OnFailure extends BaseTransform("OnFailure") {
  constructor(
    upstream: Operation,
    readonly onFailure: (a: Cause.Cause<any>) => Operation
  ) {
    super(upstream)
  }
}

/** @internal */
export class OnFailureEffect extends BaseTransform("OnFailureEffect") {
  constructor(
    upstream: Operation,
    readonly onFailure: (
      a: Cause.Cause<any>
    ) => Effect.Effect<unknown, unknown, unknown>
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "OnFailureEffect": {
        const onFailure = this.onFailure
        return new OnFailureEffect(
          this.upstream,
          (cause) => Effect.catchAllCause(onFailure(cause), downstream.onFailure)
        )
      }
      case "Map": {
        return new OnFailureEffect(this.upstream, (cause) => Effect.map(this.onFailure(cause), downstream.transform))
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class OnSuccessOrFailure extends BaseTransform("OnSuccessOrFailure") {
  constructor(
    upstream: Operation,
    readonly onSuccess: (a: any) => Operation,
    readonly onFailure: (a: any) => Operation
  ) {
    super(upstream)
  }
}

/** @internal */
export class Take extends BaseTransform("Take") {
  constructor(
    upstream: Operation,
    readonly predicate: (value: any, i: number) => boolean
  ) {
    super(upstream)
  }

  optimize(downstream: TransformOp): Operation {
    switch (downstream._op) {
      case "Take": {
        const predicate = this.predicate
        return new Take(
          this.upstream,
          (value, i) => predicate(value, i) && downstream.predicate(value, i)
        )
      }
      default: {
        return downstream
      }
    }
  }
}

/** @internal */
export class Drop extends BaseTransform("Drop") {
  constructor(
    upstream: Operation,
    readonly predicate: (value: unknown, i: number) => boolean
  ) {
    super(upstream)
  }
}

/** @internal */
export class PipeTo extends BaseTransform("PipeTo") {
  constructor(
    upstream: Operation,
    readonly downstream: Operation
  ) {
    super(upstream)
  }
}

/** @internal */
export class EmbedInput extends Base("EmbedInput") {
  constructor(
    readonly input: Channel.Channel.Input<any, any, unknown, unknown>,
    readonly output: Operation
  ) {
    super()
  }
}

/** @internal */
export class AcquireRelease extends Base("AcquireRelease") {
  constructor(
    readonly acquire: Effect.Effect<unknown, unknown, unknown>,
    readonly release: (
      a: any,
      exit: Exit.Exit<unknown, unknown>
    ) => Effect.Effect<void, never, never>
  ) {
    super()
  }
}

/** @internal */
export class Ensuring extends BaseTransform("Ensuring") {
  constructor(
    upstream: Operation,
    readonly finalizer: (
      exit: Exit.Exit<any, any>
    ) => Effect.Effect<void, never, never>
  ) {
    super(upstream)
  }
}
