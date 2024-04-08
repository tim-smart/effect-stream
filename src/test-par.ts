import { Channel, Effect, Stream } from "effect"
import * as Channel2 from "./Channel.js"
import * as Stream2 from "./Stream.js"

const poc = Channel2.range(1, 100000).pipe(
  Channel2.mapEffect(Effect.succeed, { concurrency: 50 }),
  Channel2.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("new channel")
)
const pocStream = Stream2.range(1, 100000).pipe(
  Stream2.mapEffect(Effect.succeed, { concurrency: 50 }),
  Stream2.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("new")
)
const current = Stream.range(1, 100000).pipe(
  Stream.mapEffect((_) => Effect.succeed(_), { concurrency: 50 }),
  Stream.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("current")
)
const currentChannel = Channel.suspend(() => {
  let i = 0
  const loop: Channel.Channel<number> = Channel.suspend(() => {
    if (i > 100000) {
      return Channel.unit
    }
    return Channel.zipRight(Channel.write(i++), loop)
  })
  return loop
}).pipe(
  Channel.mapOutEffectPar((_) => Effect.succeed(_), 50),
  Channel.runDrain,
  Effect.zipRight(Effect.log("done")),
  Effect.withLogSpan("current channel")
)

Effect.runPromise(Effect.all([
  poc,
  pocStream,
  current,
  currentChannel
]))
