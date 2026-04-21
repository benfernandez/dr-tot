import pino, { type LoggerOptions } from 'pino';

// Shared pino configuration used both by Fastify's request-scoped logger (via
// `logger: loggerOptions` in startWebhookServer) and by the module-level
// `logger` exported below for code that runs outside a request (startup,
// scheduler, background extraction, fire-and-forget paths).
//
// Output is JSON on stdout so Railway and `railway logs --json` can parse it.
// No transport configured in production — pino's default single-line JSON is
// ideal for log aggregators. If you want human-readable local output, pipe
// through `pino-pretty` from the devDependencies.
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'dr-tot-api',
    env: process.env.NODE_ENV ?? 'development',
  },
  // Don't leak secrets that occasionally end up in context objects (headers,
  // query strings). Pino's redact handles nested paths.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["stripe-signature"]',
      '*.apiKey',
      '*.api_key',
      '*.secret',
      '*.token',
    ],
    censor: '[redacted]',
  },
};

export const logger = pino(loggerOptions);
