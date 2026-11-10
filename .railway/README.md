# Personal Finance infrastructure

Target: GA solutions (`c3eeb9c9-ecb1-4994-8ea1-4a94ea009093`), project
`2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec`, sole production environment
`55011e12-2ebb-4637-bf00-fe7a95f4fef1`.

This is an **unvalidated draft**, not applied infrastructure. Registry/network access
is required to install the pinned SDK and generate its own lockfile. Keep this tooling
outside the application dependency graph. Do not run a mutable install from release CI.
After installation, commit the infrastructure lockfile and validate the DSL against
Railway CLI 5.71.0. Link explicitly to the project/production IDs above, then run
`railway config plan`. Review for unexpected deletions and variable changes before
`railway config apply`. Never use `--show-values` or `--include-variables`.

Railway now documents Infrastructure as Code as the supported path for new services;
legacy `railway.json`/`railway.toml` configuration is deprecated. See
https://docs.railway.com/infrastructure-as-code and its reference.

Do not attach a GitHub source. The controlled production workflow uploads the reviewed,
CI-validated checkout. The user selected production-only hosting on 2026-11-10; the
previously empty staging environment was renamed in place, retaining its ID. Provision
runtime secrets directly in the production secret store. Three disabled cron services
are included in the draft. Keep them disabled until Vercel ownership is fenced and
provider configuration is verified. Add CPU/memory limits and region after inspecting the
supported SDK fields and Neon location; these are outstanding release gates.
