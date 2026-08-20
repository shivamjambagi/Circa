"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><main className="failure-page" role="alert"><span>Circa needs a restart</span><h1>The application couldn’t continue.</h1><p>Retrying does not delete the Personal Workspace stored in this browser.</p><div><button onClick={reset}>Retry</button><a href="/">Circa home</a></div></main></body></html>;
}
