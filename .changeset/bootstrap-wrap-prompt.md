---
"@gemstack/framework": minor
---

Bootstrap mode (#297/#457) now rewords the user prompt into instructions instead of injecting a system-prompt preamble, per Rom's steer on #297 (treat Claude Code as a black box and wrap the user prompt; instructions carried in the prompt itself outweigh "contextual" system-prompt text the agent is tempted to skip). New `wrapBootstrapPrompt(userPrompt)` frames a brand-new-project run to analyze the request, `showMarkdown()` the analysis and plan, and await approval before writing any code, with the original request preserved at the end. The direct-prompt path wraps its first user prompt; the build path prepends a lighter `BOOTSTRAP_ARCHITECT_NOTE` to the architect turn (its plan-approval gate already awaits the plan). The old `BOOTSTRAP_PREAMBLE` system-prompt export and the `bootstrap` option on `systemPromptBlock` are removed. The `--bootstrap` CLI flag and its daemon mapping are unchanged.
