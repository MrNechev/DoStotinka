# Security policy

Slavotax stores personal financial data, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead use GitHub's
[private vulnerability reporting](https://github.com/MrNechev/slavotax/security/advisories/new)
for this repository. Include a description of the issue, steps to reproduce and the affected
version. You will get a response as soon as possible, and a fix will be released before details are
made public.

## Supported versions

Slavotax is in alpha; only the latest release receives security fixes.

## Hardening checklist for operators

- Put the app behind HTTPS (reverse proxy) when it is reachable from the internet and set
  `TRUST_PROXY=true`.
- Use a long random `DB_PASSWORD` and do not expose the PostgreSQL port.
- Disable sign-ups (`ALLOW_REGISTRATION=false`) after creating your accounts and disable the demo
  account (`DEMO_ENABLED=false`) on private instances.
- Back up the database regularly.
