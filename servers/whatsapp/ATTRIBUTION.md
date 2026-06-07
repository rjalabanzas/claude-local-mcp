# Attribution — whatsapp

Vendored from the **whatsapp-mcp** community server (bundled in
`philipdalen/mcp-workspace`, base `665fba8`), with local modifications to the Go
bridge (`whatsapp-bridge/main.go`, `go.mod`, `go.sum`).

Per-machine state (the `store/*.db` and QR session) is NOT vendored — it's created
locally on first bridge run. Upstream license retained in `src/LICENSE`.
