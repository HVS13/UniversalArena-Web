# Universal Arena Relay Server

This is a tiny WebSocket relay for 2-player lobbies. It stores rooms in memory and does not use a database.

## Local usage

```bash
cd server
npm install
npm run start
```

Default URL: `ws://localhost:8787`

## Session-only hosting with playit.gg (free)

Use this when you want a public relay for a play session without deploying a server.

1. Create a playit.gg account and download the Windows agent.
2. Run the agent and link it to your account.
3. Create a TCP tunnel that points to `localhost:8787`.
4. Keep both the relay (`npm run start`) and the playit agent running.

Playit will show a public address like `something.playit.gg:12345`.
Use this as your relay URL:
- Local/HTTP client: `ws://something.playit.gg:12345`
- HTTPS client: you need a `wss://` endpoint; plain TCP tunnels will be blocked as mixed content.
  If you need HTTPS hosting, use a TLS-capable host or add a TLS proxy in front of the relay.

Stop the agent when the session ends; it is not always-on hosting.

## Environment variables

- `PORT` (default: 8787)
- `MAX_PLAYERS` (default: 2)

## Client wiring

Multiplayer is not wired in the web client yet. When it is, point the client at either
`ws://localhost:8787` for local testing or your public relay URL from playit/hosting.
