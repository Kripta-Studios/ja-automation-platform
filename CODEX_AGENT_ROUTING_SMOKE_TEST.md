# Codex agent-routing smoke test

Before starting the long program, ask the parent Sol/high session:

> Spawn three tiny independent read-only tasks using the custom profiles `architect`, `frontend_lead`, `frontend_leaf`, and `spec_auditor`. Each task should only read `package.json` and report its `name`, intended configured model and reasoning effort, plus one fact from the file. Do not edit anything. Report whatever runtime/model metadata Codex exposes so I can verify the routing. Expected profiles: architect = GPT-5.6 Sol high; frontend_lead = GPT-5.6 Sol medium; frontend_leaf = GPT-5.6 Luna max with workspace-write; spec_auditor = GPT-5.6 Luna max with read-only. If the runtime does not honor the profiles, stop before the long implementation and explain the mismatch.
