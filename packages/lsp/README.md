# @tsazor/lsp

The language server of [Tsazor](../../README.md) for `.tsazor` files: the compiler's diagnostics as you type, hover,
go to definition and completion, through a typed shadow of each component — the same checks `tsazor check` runs.

The Tsazor extension for VS Code brings it along. Other editors install `@tsazor/lsp` and start `tsazor-lsp`, which
speaks LSP over stdio (`--node-ipc` and `--socket=<port>` work too). See [the language server](../../docs/language-server.md).

Its programmatic API (the package's exports; editors use the server process) is for Tsazor's own tools: released in
lockstep with them, it may change in any release and is not covered by the stability promise
([support policy](../../docs/support-policy.md), D-S7).
