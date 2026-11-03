import KeyGenerator from "./KeyGenerator";

export default function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <main className="gate">
      <h1>Listener</h1>
      <p>The server is missing these settings:</p>
      <ul>{missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
      <p className="muted">Add them in Vercel under Settings › Environment Variables, then redeploy.</p>
      <KeyGenerator />
    </main>
  );
}
