import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Route A Authoring SaaS",
  description: "Structured-first scientific publishing authoring MVP scaffold."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const isPreviewMode = process.env.NEXT_PUBLIC_ROUTE_A_PREVIEW_MODE === "demo" || process.env.ROUTE_A_PREVIEW_MODE === "demo";

  return (
    <html lang="en">
      <body>
        <main className="shell">
          {isPreviewMode ? (
            <div className="card" style={{ marginBottom: "1rem", borderColor: "#d97706", background: "#fff7ed" }}>
              <strong>Founder preview mode</strong>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                This run uses seeded in-memory demo data for product review. It does not use PostgreSQL persistence.
              </p>
            </div>
          ) : null}
          <nav className="nav" aria-label="Primary navigation">
            <a href="/">Route A Research Studio</a>
            <span>
              <a href="/research">Research Studio</a> | <a href="/projects">Projects</a> | <a href="/workspace">Author Workspace</a> |{" "}
              <a href="/qa">Internal QA</a>
            </span>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
