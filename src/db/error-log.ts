import { supabase } from './supabase';
import { logger } from '../logger';

export type ErrorContext = Record<string, unknown>;

/**
 * Record a backend error to two sinks: the pino stream (picked up by
 * `railway logs`) and the `error_log` Supabase table (queryable historical
 * record). Semantic `code` values are the primary grouping key — use stable
 * snake_case identifiers like 'sendblue_sig_fail', 'stripe_event_failed',
 * 'vision_failed' so `select code, count(*) from error_log group by code`
 * is useful.
 *
 * Never throws. A failure to insert into Supabase is itself logged (at warn)
 * but swallowed — logError must be safe to drop into any catch block,
 * including ones on critical paths like the webhook response.
 */
export async function logError(
  code: string,
  err: unknown,
  context?: ErrorContext,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error({ code, err, ...context }, message);

  try {
    const { error } = await supabase.from('error_log').insert({
      code,
      message,
      stack,
      context: context ? sanitizeContext(context) : null,
    });
    if (error) {
      logger.warn({ code, supabase_error: error.message }, 'error_log insert failed');
    }
  } catch (insertErr) {
    logger.warn(
      { code, insert_err: String((insertErr as Error)?.message ?? insertErr) },
      'error_log insert threw',
    );
  }
}

// JSON can't represent Error natively and will serialize to {} silently —
// which means our `context` jsonb loses stack traces on nested errors. Walk
// once and replace Error instances with something that survives JSON.stringify.
function sanitizeContext(ctx: ErrorContext): ErrorContext {
  const out: ErrorContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v instanceof Error) {
      out[k] = { message: v.message, stack: v.stack, name: v.name };
    } else {
      out[k] = v;
    }
  }
  return out;
}
