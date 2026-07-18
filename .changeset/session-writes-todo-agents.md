---
'@gemstack/framework': minor
---

The system prompt now points a very-large-scope session's follow-up backlog at the durable root `TODO_AGENTS.md` (#624/#682/#674) instead of a per-session `TODO_<SESSION_NAME>.agent.md`, so the session writes the one global task queue directly (per Rom's #624 confirmed-queue model).
