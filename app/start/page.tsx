function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /></span>; }

export default function StartPage() {
  return <main className="cloud-page start-page">
    <header className="cloud-header"><a className="brand" href="/"><Mark /><span className="brand-name">Circa<sup>beta</sup></span></a><div className="account-header-actions"><a href="/auth">Sign in</a><a href="/">Home</a></div></header>
    <section className="start-intro"><p className="eyebrow"><span /> Choose your route</p><h1>How do you want to<br /><em>use Circa?</em></h1><p>Personal maps are private and local-first. Communities are shared spaces with real members, useful contacts and events.</p></section>
    <section className="start-routes" aria-label="Circa routes">
      <article className="start-route personal-route"><small>Private · Local-first</small><h2>Personal Map</h2><p>Map friends, family, school, work or a private Community map. These maps stay in this browser by default.</p><a className="button button-dark" href="/?workspace=1">Start a personal map</a></article>
      <article className="start-route join-route"><small>Shared Community</small><h2>Join a Community</h2><p>Already have an invitation? Enter the code from your Community organiser and join the shared space.</p><a className="button button-paper" href="/join">Enter invite code</a></article>
      <article className="start-route create-route"><small>Shared Community</small><h2>Create a Community</h2><p>Create a shared place for members, useful contacts, events and approved local information.</p><a className="button button-paper" href="/community/new">Create a Community</a></article>
    </section>
    <p className="start-note"><strong>Community map ≠ Circa Community.</strong> A Community map is one private map category. A Circa Community is a shared space that people join.</p>
  </main>;
}
