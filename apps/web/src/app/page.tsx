export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-8">
      <main className="flex max-w-4xl flex-col items-center text-center space-y-6">
        <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400">
          AI-Powered Guitar Intelligence Platform
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-white">
          Arpegia
        </h1>
        <p className="max-w-2xl text-lg text-zinc-400">
          Upload audio, detect chords and key in real-time, generate biomechanically optimized guitar tabs, and explore AI-powered fingerstyle arrangements.
        </p>
        <div className="flex gap-4 pt-4">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            API Docs
          </a>
          <a
            href="https://github.com"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
          >
            Architecture Guide
          </a>
        </div>
      </main>
    </div>
  );
}
