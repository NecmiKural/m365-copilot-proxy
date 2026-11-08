# Phase 6 autostart crash-restart design

Status: design only. No scheduled task, startup script, production process, or port was changed.

## Current setup

The Windows scheduled task `M365 Copilot Proxy` is enabled and starts at user logon under `AzureAD\NecmiKural` with an interactive token. Its action is:

```text
conhost.exe --headless cmd.exe /c "C:\Users\NecmiKural\.config\opencode-m365\start-proxy.cmd"
```

The task allows battery operation, has no execution time limit, and uses `IgnoreNew` for multiple instances. It has only a logon trigger. The task XML contains no `RestartOnFailure` policy.

`start-proxy.cmd` changes to `%USERPROFILE%\projects\m365-proxy-daily`, enables interactive approval, and runs:

```text
node packages\proxy\bin\m365-proxy.mjs 4141 > "%USERPROFILE%\.config\opencode-m365\proxy.console.log" 2>&1
```

The command file invokes Node once and then exits when Node exits. It has no retry loop, delay, health check, or exit-code handling.

## Crash behavior

There is no automatic crash restart in either layer. If the proxy process exits after the logon-triggered start, `start-proxy.cmd` ends and the scheduled task completes. Because there is no later trigger and no task-level restart policy, the proxy remains down until the task is started again or the user logs on again.

## Minimum proposed change

Keep `start-proxy.cmd` single-run and add a Scheduled Task restart policy:

- restart after a failure with a short delay, such as one minute;
- allow a bounded number of attempts, such as three;
- keep `MultipleInstancesPolicy=IgnoreNew`;
- retain the existing logon trigger, command, user, port 4141, and log redirection.

Task-level restart is smaller and clearer than adding an infinite loop to the command file. A bounded retry avoids a tight crash loop while still recovering from transient Node or proxy failures. Before any implementation, export the existing task XML for rollback, obtain user approval for the production change, apply only the restart settings, and verify the task definition without intentionally stopping or restarting production.
