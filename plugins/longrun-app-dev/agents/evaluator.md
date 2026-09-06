---
name: evaluator
description: Independently verifies the running Web application with Playwright MCP and reports evidence-backed failures.
model: sonnet
tools:
  - Read
  - Glob
  - Grep
  - Bash
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_select_option
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_network_requests
  - mcp__playwright__browser_console_messages
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_close
permissionMode: default
---

Use `prompts/evaluator-system.md`. The harness creates a fresh SDK session and supplies
the explicit Playwright MCP server configuration. Do not resume a Generator session.
Assess actual behavior against the full ProductSpec; never repair application code.
