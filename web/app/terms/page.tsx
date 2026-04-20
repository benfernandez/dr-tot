export default function Terms() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
      <h1>Terms of Service</h1>
      <p><em>Last updated: [DATE]</em></p>
      <p>
        The full draft lives in the repo at <code>docs/terms-draft.md</code>. Swap this page to
        the lawyer-reviewed final before paid launch.
      </p>
      <p>
        <strong>Dr. Tot is not a doctor.</strong> Nothing we say is medical advice, diagnosis,
        or treatment. For anything about your medication or symptoms, talk to your prescriber.
        In an emergency, call 911.
      </p>
      <p>
        By subscribing you agree to recurring charges until you cancel. Cancel anytime at{' '}
        <a href="/account">/account</a>. Msg&amp;data rates may apply. Reply STOP to opt out.
      </p>
      <p>Questions: support@doctortot.com</p>
    </main>
  );
}
