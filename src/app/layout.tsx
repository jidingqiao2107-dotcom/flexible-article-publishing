import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Route A Authoring SaaS",
  description: "Structured-first scientific publishing authoring MVP scaffold."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
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
