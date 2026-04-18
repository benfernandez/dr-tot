import { config } from '../config';
import type { MessageRouter } from '../messaging/router';
import type { InboundMessage } from '../messaging/provider';
import {
  detectDestructiveIntent,
  buildRedirectMessage,
  isStopKeyword,
  isHelpKeyword,
  isStartKeyword,
} from '../messaging/intent';
import {
  getUserByPhone,
  createUser,
  updateUser,
  type User,
} from '../db/users';
import {
  addMessage,
  getRecentMessages,
  markInboundSeen,
  type Message,
} from '../db/messages';
import { replyTo } from '../ai/nutritionist';
import { describeMeal } from '../ai/vision';
import { handleOnboardingTurn } from './onboarding';
import { extractLogs } from './intent-extractor';
import { addProtein } from '../db/protein';
import { DateTime } from 'luxon';

const HELP_TEXT = `I'm Dr. Tot — your AI nutrition companion for GLP-1 medications. Text me anytime, send meal photos, or just chat. For account stuff, head to ${config.publicAppUrl}/account. Reply STOP to opt out. Msg&data rates may apply.`;

const RATE_LIMIT_PER_HOUR = 30;

export async function handleInbound(
  router: MessageRouter,
  inbound: InboundMessage,
): Promise<void> {
  const firstSeen = await markInboundSeen('sendblue', inbound.providerMessageId);
  if (!firstSeen) return;

  let user = await getUserByPhone(inbound.from);

  // STOP is carrier-mandated: must honor regardless of user state, instantly.
  if (inbound.text && isStopKeyword(inbound.text)) {
    if (user && !user.opted_out_at) {
      await updateUser(user.id, { opted_out_at: new Date().toISOString() });
    }
    await router.send({
      to: inbound.from,
      text: `You're opted out of Dr. Tot. No more messages. Visit ${config.publicAppUrl}/account to manage or restore.`,
    });
    return;
  }

  if (inbound.text && isHelpKeyword(inbound.text)) {
    await router.send({ to: inbound.from, text: HELP_TEXT });
    return;
  }

  // START / YES is the double-opt-in confirmation for a pre-authorized number.
  if (!user) {
    if (inbound.text && isStartKeyword(inbound.text)) {
      // We only create a user on their first inbound after an admin pre-authorizes
      // them — see scripts/add-user.ts. Without that path there's no user yet, so
      // a cold START means "someone is texting a number we haven't whitelisted."
      await router.send({
        to: inbound.from,
        text: `Welcome! This number isn't set up yet. Ping the friend who sent you, or reach out: ${config.publicAppUrl}`,
      });
      return;
    }
    // Unknown sender with no START — silently drop. Prevents random texts from
    // provisioning accounts.
    return;
  }

  if (user.opted_out_at) {
    if (inbound.text && isStartKeyword(inbound.text)) {
      await updateUser(user.id, { opted_out_at: null });
      await router.send({
        to: inbound.from,
        text: "You're back. I'll pick up where we left off. 🌱",
      });
    }
    return;
  }

  // Consent not yet granted — this is a pre-authorized number waiting for YES.
  if (!user.consent_granted_at) {
    if (inbound.text && isStartKeyword(inbound.text)) {
      user = await updateUser(user.id, {
        consent_granted_at: new Date().toISOString(),
        preferred_channel: inbound.channel,
      });
      await handleOnboardingTurn(router, user, null);
      return;
    }
    await router.send({
      to: inbound.from,
      text: 'Reply YES to confirm Dr. Tot, your AI nutrition companion. Msg&data rates apply. Reply STOP to opt out, HELP for help.',
    });
    return;
  }

  // Update preferred_channel if it drifted (e.g., user got a new iPhone).
  if (user.preferred_channel !== inbound.channel) {
    user = await updateUser(user.id, { preferred_channel: inbound.channel });
  }

  // Destructive intent → redirect before spending any LLM tokens.
  if (inbound.text && detectDestructiveIntent(inbound.text)) {
    await router.send({ to: inbound.from, text: buildRedirectMessage(config.publicAppUrl) });
    return;
  }

  // Per-user rate limit — protects spend from one runaway user.
  const recent = await getRecentMessages(user.id, config.maxHistoryMessages * 2);
  const userMsgsLastHour = recent.filter(
    (m) => m.role === 'user' && Date.now() - new Date(m.created_at).getTime() < 60 * 60_000,
  ).length;
  if (userMsgsLastHour >= RATE_LIMIT_PER_HOUR) {
    await router.send({
      to: inbound.from,
      text: "Let's take a breath — I've got you. Text me again in a bit.",
    });
    return;
  }

  if (!user.onboarding_complete) {
    await handleOnboardingTurn(router, user, inbound.text || null);
    return;
  }

  await handleChatTurn(router, user, inbound, recent);
}

async function handleChatTurn(
  router: MessageRouter,
  user: User,
  inbound: InboundMessage,
  history: Message[],
): Promise<void> {
  let userText = inbound.text.trim();

  // Photo → vision pass first, fold result into the chat turn as context.
  if (inbound.mediaUrls.length > 0) {
    const vision = await describeMeal(inbound.mediaUrls[0], userText);
    userText = userText
      ? `${userText}\n\n[Photo description: ${vision.description} — protein estimate: ~${vision.proteinGrams}g]`
      : `[Photo: ${vision.description} — protein estimate: ~${vision.proteinGrams}g]`;

    const localDate = DateTime.now().setZone(user.timezone).toISODate();
    if (localDate && vision.proteinGrams > 0) {
      await addProtein(user.id, vision.proteinGrams, `photo: ${vision.description.slice(0, 60)}`, localDate);
    }
  }

  if (!userText) return;

  await addMessage(user.id, 'user', userText);

  // Background: extract structured logs (protein amounts, feelings) from text.
  extractLogs(user, userText).catch((err) => console.error('extractLogs', err));

  const reply = await replyTo(user, history, userText);
  await router.send({ to: user.phone_number, text: reply });
  await addMessage(user.id, 'assistant', reply);
}

/**
 * Create a user from an admin action. Does not send a message — caller sends
 * the double-opt-in prompt via the router. Returns the new user row.
 */
export async function preauthorizeUser(phoneNumber: string, firstName?: string): Promise<User> {
  const existing = await getUserByPhone(phoneNumber);
  if (existing) return existing;
  return createUser(phoneNumber, firstName);
}
