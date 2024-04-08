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
})
