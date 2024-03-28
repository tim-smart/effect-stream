/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import type { LazyArg } from "effect/Function"
import { dual } from "effect/Function"
import * as Option from "effect/Option"
import { type Pipeable, pipeArguments } from "effect/Pipeable"
import * as Channel from "./Channel.js"

const DefaultChunkSize = 4096

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId = Symbol.for("effect/Stream")

/**
 * @since 1.0.0
 * @category type ids
 */
export type TypeId = typeof TypeId

/**
 * @since 1.0.0
 * @category models
 */
export interface Stream<A, E = never, R = never> extends Pipeable {
  readonly [TypeId]: TypeId
  readonly channel: Channel.Channel<Array<A>, unknown, E, unknown, R>
}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromChannel = <O, I, E, IE, R>(channel: Channel.Channel<Array<O>, I, E, IE, R>): Stream<O, E, R> => {
  const self = Object.create(Proto)
  self.channel = channel
  return self
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const empty: Stream<never> = fromChannel(Channel.empty)

/**
 * @since 1.0.0
 * @category constructors
 */
export const never: Stream<never> = fromChannel(Channel.never)

/**
 * @since 1.0.0
 * @category constructors
 */
export const succeed = <A>(value: A): Stream<A> => fromChannel(Channel.succeed([value]))

/**
 * @since 1.0.0
 * @category constructors
 */
export const sync = <A>(evaluate: LazyArg<A>): Stream<A> => fromChannel(Channel.sync(() => [evaluate()]))

/**
 * @since 1.0.0
 * @category constructors
 */
export const unsafeFromArray = <A>(array: ReadonlyArray<A>): Stream<A> =>
  fromChannel(Channel.succeed(array as Array<A>))

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromIterable = <A>(iterable: Iterable<A>, chunkSize = DefaultChunkSize): Stream<A> => {
  const channel = Channel.suspend(() => {
    const iterator = iterable[Symbol.iterator]()
    const done = false
    return Channel.repeatEffectOption(Effect.suspend(() => {
      if (done) {
        return Effect.fail(Option.none())
      }
      const chunk: Array<A> = []
      for (let i = chunkSize; i > 0; i--) {
        const next = iterator.next()
        if (next.done) {
          return chunk.length === 0 ? Effect.fail(Option.none()) : Effect.succeed(chunk)
        }
        chunk.push(next.value)
      }
      return Effect.succeed(chunk)
    }))
  })
  return fromChannel(channel)
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const range = (start: number, end?: number, chunkSize = DefaultChunkSize): Stream<number> => {
  const channel = end === undefined
    ? Channel.suspend(() => {
      let i = start
      return Channel.repeatEffect(Effect.sync(() => {
        const chunk: Array<number> = []
        for (let j = 0; j < chunkSize; j++) {
          chunk.push(i++)
        }
        return chunk
      }))
    })
    : Channel.suspend(() => {
      const actualEnd = start > end ? 1 : end - start + 1
      let i = start
      return Channel.repeatEffectOption(
        Effect.suspend(() => {
          const chunk: Array<number> = []
          for (let j = 0; j < chunkSize; j++) {
            const value = i++
            if (value > actualEnd) {
              return chunk.length === 0 ? Effect.fail(Option.none()) : Effect.succeed(chunk)
            }
            chunk.push(value)
          }
          return Effect.succeed(chunk)
        })
      )
    })
  return fromChannel(channel)
}

/**
 * @since 1.0.0
 * @category mapping
 */
export const map: {
  <A, B>(
    f: (o: NoInfer<A>) => B
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B>(
    self: Stream<A, E, R>,
    f: (o: A) => B
  ): Stream<B, E, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Stream<A, E, R>,
    f: (o: A) => B
  ): Stream<B, E, R> => fromChannel(Channel.map(self.channel, (chunk) => chunk.map(f)))
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const mapEffect: {
  <A, B, E2, R2>(
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Stream<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Stream<B, E | E2, R | R2> => fromChannel(Channel.mapChunkEffect(self.channel, f))
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const tap: {
  <A, B, E2, R2>(
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Stream<A, E | E2, R | R2> => fromChannel(Channel.mapChunkEffect(self.channel, (a) => Effect.as(f(a), a)))
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const mapChunks: {
  <A, B>(
    f: (o: NoInfer<Array<A>>) => Array<B>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<Array<A>>) => Array<B>
  ): Stream<B, E, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<Array<A>>) => Array<B>
  ): Stream<B, E, R> => fromChannel(Channel.map(self.channel, f))
)

/**
 * @since 1.0.0
 * @category mapping
 */
export const mapChunksEffect: {
  <A, B, E2, R2>(
    f: (o: NoInfer<Array<A>>) => Effect.Effect<Array<B>, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<Array<A>>) => Effect.Effect<Array<B>, E2, R2>
  ): Stream<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (o: NoInfer<Array<A>>) => Effect.Effect<Array<B>, E2, R2>
  ): Stream<B, E | E2, R | R2> => fromChannel(Channel.mapEffect(self.channel, f))
)

/**
 * @since 1.0.0
 * @category filtering
 */
export const take: {
  (
    n: number
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    n: number
  ): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    n: number
  ): Stream<A, E, R> =>
    fromChannel(Channel.suspend(() => {
      let done = false
      let count = 0
      return Channel.map(
        Channel.takeWhile(self.channel, (chunk, _i) => {
          if (done) {
            return false
          }
          count += chunk.length
          if (count >= n) {
            done = true
          }
          return true
        }),
        (chunk) => count > n ? chunk.slice(0, n - count) : chunk
      )
    }))
)

/**
 * @since 1.0.0
 * @category execution
 */
export const runDrain = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<void, E, R> => Channel.runDrain(self.channel)

/**
 * @since 1.0.0
 * @category execution
 */
export const runCollect = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<Array<A>, E, R> =>
  Effect.suspend(() => {
    const array: Array<A> = []
    return Effect.as(
      Channel.runForEach(self.channel, (chunk) =>
        Effect.sync(() => {
          // eslint-disable-next-line no-restricted-syntax
          array.push(...chunk)
        })),
      array
    )
  })
