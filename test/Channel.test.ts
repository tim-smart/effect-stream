import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref, TestClock } from "effect"
import * as Channel from "effect-stream/Channel"

describe("Channel", () => {
  describe("buffer", () => {
    it.effect("should buffer", () =>
      Effect.gen(function*(_) {
        const count = yield* _(Ref.make(0))
        const consumed = yield* _(Ref.make(0))
        yield* _(
          Channel.repeatEffect(Ref.getAndUpdate(count, (n) => n + 1)),
          Channel.take(10),
          Channel.buffer(3),
          Channel.tap(() => Effect.sleep(1000)),
          Channel.runForEach((_) => Ref.update(consumed, (n) => n + 1)),
          Effect.fork
        )
        yield* _(TestClock.adjust(0))
        assert.strictEqual(yield* _(Ref.get(count)), 4)
        assert.strictEqual(yield* _(Ref.get(consumed)), 0)
        yield* _(TestClock.adjust(1000))
        assert.strictEqual(yield* _(Ref.get(count)), 5)
        assert.strictEqual(yield* _(Ref.get(consumed)), 1)
        yield* _(TestClock.adjust(9000))
        assert.strictEqual(yield* _(Ref.get(count)), 10)
        assert.strictEqual(yield* _(Ref.get(consumed)), 10)
      }))
  })

  describe("finalization", () => {
    it.effect("ensuring", () =>
      Effect.gen(function*(_) {
        const ref = yield* _(Ref.make<ReadonlyArray<string>>([]))
        const event = (label: string) => Ref.update(ref, (array) => [...array, label])
        const channel = Channel.fromEffect(event("acquire1")).pipe(
          Channel.ensuring(() => event("release11")),
          Channel.ensuring(() => event("release12")),
          Channel.flatMap(() =>
            Channel.fromEffect(event("acquire2")).pipe(
              Channel.ensuring(() => event("release2"))
            )
          )
        )
        const result = yield* _(
          Channel.runDrain(Channel.take(channel, 1)),
          Effect.zipRight(Ref.get(ref))
        )
        console.log(result)
        assert.deepStrictEqual(result, [
          "acquire1",
          "acquire2",
          "release2",
          "release11",
          "release12"
        ])
      }))
  })
})
