# DSH Task Notice Board

Task-scoped durable context shared by multiple DeepSeek Harness sessions.

This plugin treats a Task as the long-lived collaboration boundary. Sessions assigned to the same Task receive a bounded snapshot of its objective and retained updates on their next model step. Agents can publish durable findings and search older retained updates without copying raw transcripts.

## Current capabilities

- Durable Task records with compare-and-set revisions
- Session-lifecycle ownership by Task
- Bounded, source-attributed cross-session context
- Idempotent `task_context_publish`
- Bounded `task_context_search`
- Closed Tasks reject new collaborative updates without stopping Sessions
- No raw transcript synchronization and no proactive Session wake-up
- Typert Remote face `ctx.remote.taskBoard.*` on the browser, served by the host `TaskStore`
- Task Board view tab under `conversation.view`: list, create, close/reopen, assign / unassign the current session, and browse retained entries

Installing the plugin into the `web` profile is all it takes — the browser page picks up the client bundle through harness's own `dsh.client` scanner and the Task Board tab appears beside chat and trajectory in every open Session. No harness patch, no static registration, no manual UI wiring.

## Requirements

- DeepSeek Harness `0.1.0-rc.7` or newer compatible release
- Node.js `^22.19.0` or `>=24` — the plugin ships stage-3 decorators in its
  compiled artefacts (Typert `@Remote` markers) that Node parses natively only
  in these versions; Node 23 will refuse to load the entries with
  `SyntaxError: Invalid or unexpected token`.
- pnpm 10+
- The DSH `web` profile, whose storage services back Task persistence

## Install from this checkout

Run this from the plugin directory:

```sh
pnpm install
pnpm run build
dsh plugin --profile web add .
```

Then start DeepSeek Harness normally:

```sh
dsh web
```

To remove it:

```sh
dsh plugin --profile web remove dsh-task-notice-board
```

## Install from GitHub

After the repository is published:

```sh
dsh plugin --profile web add github:SLin-code/dsh-task-notice-board
```

Git-hosted installation runs the package `prepare` script. pnpm may first require you to allow the reviewed `tsdown` build in the profile's `pnpm-workspace.yaml`; follow the exact key printed by DSH and repeat the install.

## Runtime model

The bundle adds three Cordis entries:

- `dsh-task-notice-board/task` owns Task records, Task context, and Session assignments.
- `dsh-task-notice-board/task-context-sync` projects bounded Task memory into the next model step.
- `dsh-task-notice-board/tool-task-context` exposes publish and search tools to assigned Sessions.

Task assignment is currently performed by a Host plugin through `ctx.tasks`. A Session cannot switch Tasks after its first model step has started.

## License

MIT. The initial implementation is derived from DeepSeek Harness conventions and APIs; see the repository history for changes.
