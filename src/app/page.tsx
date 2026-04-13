const features = [
  {
    title: "Structured-first",
    body: "The manuscript view is compiled from claims, evidence, figures, methods, limitations, and metadata."
  },
  {
    title: "Human authority",
    body: "AI can suggest and review, but only human authors can approve scientific claims and final export intent."
  },
  {
    title: "Export compiler",
    body: "Legacy outputs are render targets from the internal research-object graph, not the canonical source."
  }
];

export default function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">Route A MVP Scaffold</p>
      <h1>Structured research-object authoring for scientific publishing.</h1>
      <p className="muted">
        This scaffold starts the product as a modular monolith with portable domain rules, deterministic AI-review
        stubs, explicit approval gates, and export readiness checks.
      </p>
      <div className="grid">
        {features.map((feature) => (
          <article className="card" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

