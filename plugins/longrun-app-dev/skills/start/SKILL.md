---
name: start
description: Start a new longrun-app-dev run from a short application request. Use when the user invokes /longrun-app-dev:start or explicitly asks this harness to start a new run.
---

# Start a long-running development run

Require a non-empty application request in `$ARGUMENTS`. If it is missing, ask the user for the application they want built.

Run `longrun-app-dev start $ARGUMENTS` with the Bash tool from the current project directory.

Report the command result to the user. Do not claim that a Run started unless the CLI reports success.
