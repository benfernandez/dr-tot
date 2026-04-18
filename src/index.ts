import { Telegraf } from 'telegraf';
import { config } from './config';
import { registerHandlers } from './bot/handlers';
import { startScheduler } from './proactive/scheduler';

async function main() {
  const bot = new Telegraf(config.telegramToken);

  registerHandlers(bot);
  startScheduler(bot);

  console.log('Dr. Tott is starting…');
  bot.launch({ dropPendingUpdates: true }).catch((err) => console.error('bot stopped', err));
  const me = await bot.telegram.getMe();
  console.log(`Dr. Tott is live as @${me.username}`);

  const shutdown = (sig: string) => {
    console.log(`${sig} received, stopping…`);
    bot.stop(sig);
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
