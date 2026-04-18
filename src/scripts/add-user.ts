import { preauthorizeUser } from '../conversation/pipeline';
import { buildMessageRouter } from '../messaging/router';
import { normalizePhone } from '../db/users';

/**
 * Admin tool: pre-authorize a friend's phone number, then text them a
 * double-opt-in prompt. They must reply YES before Dr. Tot does anything else.
 *
 * Usage: npm run add-user -- +15551234567 "Alice"
 */
async function main() {
  const [rawPhone, firstName] = process.argv.slice(2);
  if (!rawPhone) {
    console.error('Usage: npm run add-user -- +15551234567 "FirstName"');
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);
  const user = await preauthorizeUser(phone, firstName);
  console.log(`Pre-authorized: ${user.phone_number} (id=${user.id})`);

  if (user.consent_granted_at) {
    console.log('User has already granted consent — skipping opt-in text.');
    return;
  }

  const router = buildMessageRouter();
  const invite = firstName
    ? `Hey ${firstName} — this is Dr. Tot, an AI nutrition companion for GLP-1 meds. Reply YES to confirm, STOP to opt out. Msg&data rates may apply.`
    : `Hi — this is Dr. Tot, an AI nutrition companion for GLP-1 meds. Reply YES to confirm, STOP to opt out. Msg&data rates may apply.`;

  const result = await router.send({ to: phone, text: invite });
  console.log(`Invite sent via ${result.via} (delivered as ${result.deliveredAs}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
