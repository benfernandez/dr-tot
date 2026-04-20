export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: [DATE]</em></p>
      <p>
        The full draft lives in the repo at <code>docs/privacy-policy-draft.md</code>. Swap this
        page to the lawyer-reviewed final before paid launch — Meta ads review and Stripe both
        check for a real privacy policy URL.
      </p>
      <p>
        Dr. Tot is not a medical provider. Messages you send are processed by Anthropic&apos;s
        API to generate responses. We do not sell your data. You can export or delete your data
        anytime at <a href="/account">/account</a>. Opt out of SMS at any time by replying STOP.
      </p>
      <p>Questions: support@doctortot.com</p>
    </main>
  );
}
