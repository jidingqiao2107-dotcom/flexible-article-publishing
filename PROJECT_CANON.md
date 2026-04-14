# Project Canon

## Project name
Flexible Article Publishing

## Core identity
Flexible Article Publishing is a structured research-object authoring system for scientific publishing.

It is not primarily a manuscript editor, a prose-polishing tool, or a generic AI writing assistant.

Its core value is to reduce non-creative labor in scientific authoring and publishing while increasing consistency, traceability, inspectability, and reviewability.

---

## Foundational belief
A scientific paper should not be treated only as a linear text document.

The deeper source of truth is a structured research object composed of explicit scientific units and their relationships.

Manuscript text is an output representation of that structure, not the primary authority.

---

## Source of truth
The canonical source of truth in this product is a structured paper graph.

This graph may include, where applicable:

- claim
- evidence
- figure
- method
- citation
- limitation
- reviewer-risk flag
- review comment
- author response
- version
- approval event
- export artifact

Freeform manuscript text must not silently replace or override the structured graph as the primary scientific record.

---

## Human and AI roles
Human authors remain the final scientific authority.

AI may assist by:
- organizing structured inputs
- identifying missing links or inconsistencies
- suggesting wording
- generating compatible manuscript text
- flagging reviewer risks
- checking formatting and cross-references

AI must not:
- independently approve scientific conclusions
- silently invent unsupported claims
- conceal uncertainty, missing evidence, or unresolved inconsistencies
- act as the final authority on scientific validity

---

## What the system is for
The system exists to help authors move from structured scientific content to publishable outputs with less repetitive and mechanical work.

The system should be especially valuable in tasks such as:
- assembling claims from structured results
- linking claims to evidence, figures, methods, citations, and limitations
- generating consistent manuscript components from shared structured content
- checking internal consistency across main text and supporting information
- preparing journal-compatible submission materials
- preserving provenance and reviewability across revisions

---

## Author input philosophy
Authors should be able to begin from structured scientific materials rather than only from a blank manuscript draft.

Typical inputs may include:
- paper title
- one-line contribution or central claim
- figures and figure logic
- methods blocks
- result claims
- references and prior work
- limitations
- open questions
- target journal
- target article type

The product should respect the way scientific work is actually produced: as linked findings, methods, figures, citations, and constraints, not only as finished prose.

---

## Generation philosophy
Generated text is a compiled representation of structured scientific content.

The system may generate, where useful:
- abstract
- results narrative
- figure legends
- cover letter
- supporting information cross-links
- journal-specific formatting
- disclosure and metadata blocks

Text generation is not the ultimate goal.
Generation exists to translate structured scientific content into publishable and reviewable forms.

---

## Validation philosophy
Validation is a core function of the product, not an optional add-on.

The system should help check whether:
- claims are supported by appropriate evidence, figures, tables, methods, citations, or limitations
- figure numbering and reference numbering are consistent
- supporting information and main text cross-references are aligned
- claim language and figure legends do not drift apart
- disclosure requirements are represented
- authorship and publication metadata are complete where applicable

The product should make inconsistencies and missing support visible rather than hide them behind fluent prose.

---

## Export philosophy
The system should support coexistence between:
- traditional publication formats
- emerging structured online publication formats

Exports are compiled products of the structured graph.

No export should silently destroy key scientific structure, provenance, or traceability without making that loss explicit.

---

## Core product values
The product should optimize for:
- reduction of repetitive, low-creativity author labor
- explicit claim support and scientific traceability
- consistency across manuscript components
- inspectability for authors, collaborators, reviewers, and editors
- preservation of human scientific judgment
- compatibility with real publication workflows

The product should not optimize primarily for:
- stylistic imitation of native English
- superficial prose elegance without structural correctness
- magical automation that hides scientific uncertainty
- replacing authorial responsibility

---

## Trust principle
The product must not create false confidence.

A fluent manuscript is not enough.
A well-formatted export is not enough.
A convincing AI-generated paragraph is not enough.

The system is only trustworthy when the underlying scientific structure, support relationships, provenance, and review signals remain visible and meaningful.

---

## Decision rule
When product, UX, or engineering choices are ambiguous, prefer the option that better preserves:

1. human scientific authority
2. graph-first truth
3. explicit support relationships
4. consistency and inspectability
5. reduction of non-creative labor
6. compatibility with real publishing workflows

---

## Non-goals
This project is not primarily:
- a generic chat interface for writing papers
- a grammar-polishing assistant
- a replacement for scientific judgment
- a system that treats manuscript prose as the only true research artifact

---

## Canonical summary
Flexible Article Publishing is a graph-first scientific authoring and publishing system.

Its purpose is to transform structured scientific content into consistent, reviewable, and exportable publication outputs while preserving human authority, explicit support relationships, and scientific traceability.