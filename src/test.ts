import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Stream2 from "./Stream.js"

console.time("new")
const outNew = Stream2.range(0, 1_000_000).pipe(
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.mapEffect((i) => Effect.succeed(i + 1)),
  Stream2.take(100000),
  Stream2.runCollect,
  Effect.runSync
)
console.log("new", outNew.length)
console.timeEnd("new")

console.time("current")
const outCurrent = Stream.range(0, 1_000_000).pipe(
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.mapEffect((i) => Effect.succeed(i + 1)),
  Stream.take(100000),
  Stream.runCollect,
  Effect.runSync
)
console.log("current", outCurrent.length)
console.timeEnd("current")
