/**
 * Structured logs: one JSON object per line.
 *
 * A free-text line is readable until it isn't — once there are several
 * processes and a lot of traffic, the only way to answer "how many requests
 * 500'd in the last five minutes, and for which route?" is to grep, and grep
 * does not count or group. A JSON line can be parsed, so the platform's log
 * tooling can filter and aggregate without a bespoke parser per message. The
 * existing human-readable lines are kept as a `msg` field so nothing is lost
 * for a person reading along.
 *
 * Every field is one of a small set of fixed names, and anything that could
 * carry a secret or a raw header is passed through `sanitize` by the caller —
 * a log line is the easiest place for a token to leak into a third-party log
 * store, so the shape stays deliberately narrow.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogFields = {
  /** Stable, low-cardinality name for the kind of event ("http", "error", …). */
  event: string;
  /** The correlation id for the request, when there is one. */
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  /** A short reason tag (e.g. an error class), never a raw message body. */
  reason?: string;
  /** Free text for a human. Kept short; not for anything machine-read. */
  msg: string;
};

/** One sink for every structured line, so a test can capture the whole stream. */
export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => console.error(line);

export function createLogger(sink: LogSink = defaultSink) {
  return function log(level: LogLevel, fields: LogFields): void {
    const record: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      ...fields,
    };
    // JSON.stringify never emits a raw newline, so one call is always one line
    // — which is the property a line-oriented log collector depends on.
    sink(JSON.stringify(record));
  };
}

export const log = createLogger();
