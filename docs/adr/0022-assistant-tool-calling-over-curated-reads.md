# Assistant answers via tool-calling over curated read functions

The **Assistant** (issue #101) answers natural-language questions about a Household's finances. The roadmap note floated "retrieval + LLM tool-calling", but we do NOT use embeddings/RAG or let the model write SQL. Instead the model (Sonnet 5, via the existing AI Gateway — ADR-0005) is given a fixed set of **household-scoped, read-only tools** that wrap the already-tested `lib/dashboard/*` helpers and `householdRepo` (cycle summary, cross-cycle movers, top merchants, spend-by-type, transaction search, spending trend, savings status, financial health). The tools are the ground truth; the model orchestrates and narrates. Premium-only, like Bank connections and Invites.

## Considered Options

- **Text-to-SQL** (model emits SQL, executed read-only) — rejected: it would have to re-encode the net rules the lib already owns (unmarked-credit exclusion ADR-0009, per-txn Excluded ADR-0011, Own share ADR-0014, effective-dated income/off-card costs ADR-0015), and it risks tenant leaks, wrong math, and injection/perf issues. Curated tools reuse the tested math and are tenant-safe by construction.
- **Embeddings / RAG** — rejected: household finance questions are overwhelmingly aggregational and numeric ("why was March higher", "top merchants"), which vector similarity answers poorly. Free-text merchant/description lookups are covered by a `searchTransactions` tool instead.

## Consequences

- Answer quality is bounded by the tool surface: a question no tool covers gets an honest "I can't answer that from your data" rather than a fabricated number. New question classes require a new tool, not a prompt tweak.
- Because tools call the same code paths as the dashboard, the Assistant and the dashboard can never disagree on a figure.
- The Assistant is the one place AI-generated text is localized (answers follow the Member's Locale), unlike Classification `reasoning` which stays English (see CONTEXT.md).
