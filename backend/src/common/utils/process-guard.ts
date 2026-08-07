import { Logger } from '@nestjs/common';

const logger = new Logger('ProcessGuard');

let installed = false;

function formatReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.stack || reason.message;
  }
  try {
    return typeof reason === 'string' ? reason : JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Install once at process boot — before Nest boots.
 * Any uncaught error / rejection is logged; process stays alive.
 */
export function installProcessGuards() {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason) => {
    logger.error(`UnhandledRejection — process kept alive\n${formatReason(reason)}`);
  });

  process.on('uncaughtException', (err, origin) => {
    logger.error(
      `UncaughtException (${origin || 'unknown'}) — process kept alive\n${err.stack || err.message}`,
    );
  });

  process.on('warning', (warning) => {
    logger.warn(`ProcessWarning: ${warning.name}: ${warning.message}`);
  });
}
