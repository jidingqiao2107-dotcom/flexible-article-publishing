export default function ProjectsPage() {
  return (
    <section>
      <p className="eyebrow">Projects</p>
      <h1>Project Dashboard</h1>
      <p className="muted">
        MVP dashboard shell for structured manuscript projects. The Prisma-backed project API is available at{" "}
        <code>/api/projects</code>.
      </p>
      <div className="grid">
        <article className="card">
          <h2>Prisma-backed API</h2>
          <p>Create and list projects through the API route while the UI remains a simple scaffold.</p>
          <a href="/workspace">Open demo workspace</a>
        </article>
      </div>
    </section>
  );
}
