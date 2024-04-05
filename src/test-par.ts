import { Effect, Stream } from "effect"
import * as Channel from "./Channel.js"
import * as Stream2 from "./Stream.js"

const poc = Channel.range(1, 100000).pipe(
  Channel.mapEffect(Effect.succeed, { concurrency: 50 }),
  Channel.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("new channel")
)
const pocStream = Stream2.range(1, 100000).pipe(
  Stream2.mapEffect(Effect.succeed, { concurrency: 50 }),
  Stream2.runCollect,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("new")
)
const current = Stream.range(1, 100000).pipe(
  Stream.mapEffect(Effect.succeed, { concurrency: 50 }),
  Stream.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("current")
)

Effect.runPromise(Effect.all([
  poc,
  pocStream,
  current
]))
