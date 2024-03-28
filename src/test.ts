import type { Cause } from "effect"
import { Queue } from "effect"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Channel from "./Channel.js"
import * as Stream2 from "./Stream.js"

console.time("current")
const outCurrent = Stream.range(1, 1_000_00).pipe(
  Stream.mapEffect((i) => {
    return Effect.succeed(i + 1)
  }),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.runCollect,
  Effect.runSync
)
console.log("current", outCurrent.length)
console.timeEnd("current")

console.time("new")
const outNew = Stream2.range(1, 1_000_00).pipe(
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  //   Channel2.take(100000),
  Stream2.runCollect,
  Effect.runSync
)
console.log("new", outNew.length)
console.timeEnd("new")

// const [outCurrent] = Channel.suspend(() => {
//   let i = 1
//   const loop: Channel.Channel<number> = Channel.flatMap(
//     Channel.sync(() => i++),
//     (i) =>
//       Channel.zipRight(
//         Channel.write(i),
//         i >= 100000 ? Channel.unit : loop
//       )
//   )
//   return loop
// }).pipe(
//   Channel.mapOutEffect((i) => Effect.succeed(i + 1)),
//   Channel.mapOutEffect((i) => Effect.succeed(i + 1)),
//   Channel.mapOutEffect((i) => Effect.succeed(i + 1)),
//   Channel.mapOutEffect((i) => Effect.succeed(i + 1)),
//   Channel.mapOutEffect((i) => Effect.succeed(i + 1)),
//   Channel.runCollect,
//   Effect.runSync
// )

Effect.gen(function*(_) {
  const queue = yield* _(Queue.unbounded<number>())
  const input = Channel.input({
    onInput(input: number) {
      return Queue.offer(queue, input)
    },
    onFailure(cause: Cause.Cause<unknown>) {
      return Effect.unit
    },
    onDone() {
      return Queue.shutdown(queue)
    }
  })
  const a = Channel.fromQueue(queue).pipe(
    Channel.embedInput(input)
  )
  yield* _(
    Channel.range(1, 10),
    Channel.pipeTo(a),
    Channel.runForEach(Effect.log)
  )
}).pipe(Effect.runPromise)
