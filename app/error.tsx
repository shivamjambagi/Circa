"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Circa route failed", { digest: error.digest || "unavailable" }); }, [error.digest]);
  return <main className="failure-page" role="alert"><span>Something went wrong</span><h1>Circa couldn’t open this page.</h1><p>Your Personal Workspace has not been changed. Retry, or return home.</p><div><button className="button button-dark" onClick={reset}>Retry</button><a className="button button-paper" href="/">Circa home</a></div></main>;
}
