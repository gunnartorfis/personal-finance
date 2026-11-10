# Personal Finance infrastructure

Target: GA solutions (`c3eeb9c9-ecb1-4994-8ea1-4a94ea009093`), project
`2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec`, staging environment
`55011e12-2ebb-4637-bf00-fe7a95f4fef1`.

This is an **unvalidated draft**, not applied infrastructure. Registry/network access
is required to install the pinned SDK and generate its own lockfile. Keep this tooling
outside the application dependency graph. Do not run a mutable install from release CI.
After installation, commit the infrastructure lockfile and validate the DSL against
Railway CLI 5.71.0. Link explicitly to the project/staging IDs above, then run
`railway config plan`. Review for unexpected deletions and variable changes before
`railway config apply`. Never use `--show-values` or `--include-variables`.

Railway now documents Infrastructure as Code as the supported path for new services;
legacy `railway.json`/`railway.toml` configuration is deprecated. See
https://docs.railway.com/infrastructure-as-code and its reference.

Do not attach a GitHub source. The controlled staging workflow uploads the reviewed
checkout. Provision runtime secrets only after isolation is proved. Three disabled cron services are included in the draft. Add CPU/memory
limits, region and production desired state after inspecting the
supported SDK fields and Neon location; these are outstanding release gates.
