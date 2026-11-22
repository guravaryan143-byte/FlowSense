# Security Policy

## Reporting a vulnerability

Do not publish sensitive details in a public issue before private remediation is possible. Report suspected vulnerabilities to the repository owner through a private GitHub security advisory.

## Secret handling

- Never commit `.env` or environment files containing credentials.
- Generate secrets locally and store production secrets in a managed secret store.
- Rotate exposed database passwords, JWT secrets, API keys, and demo credentials.
- Do not include credentials in logs, tests, reports, screenshots, or documentation.

## Supported scope

FlowSense is an application for a fictional, simulated traffic network. Traffic and accident data should not be presented as real-world live operational data.
