import KeyGenerator from "./KeyGenerator";

export default function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-6 pt-safe pb-safe">
      <h1 className="pt-8 text-2xl font-bold tracking-tight">Listener</h1>
      <p className="text-[15px]">The server is missing these settings:</p>
      <ul className="flex flex-col gap-1 pl-5 text-[15px]">
        {missing.map((m) => <li key={m} className="list-disc"><code>{m}</code></li>)}
      </ul>
      <p className="text-[14px] text-muted-foreground">Add them in Vercel under Settings › Environment Variables, then redeploy.</p>
      <KeyGenerator />
    </main>
  );
}
