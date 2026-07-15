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
- `RECONNECT_GRACE_MS` (default: 120000)

## Client wiring

The web client connects to the relay from the setup screen. Use `ws://localhost:8787`
for local testing or your public relay URL from playit/hosting.

Lobby notes:
- Each browser keeps a local client id and saved lobby code.
- If a player refreshes or briefly loses connection, they can reconnect to reclaim
  their previous seat before `RECONNECT_GRACE_MS` expires.
- Both connected players must mark Ready in the client before the host can start.
- The host remains authoritative for match state; guests send action requests and
  can request a resync if their client falls behind.
- The relay keeps the latest host-approved setup and match snapshots in memory so
  either seat can restore the current stage after reconnecting. Snapshots disappear
  when the lobby closes or the relay process restarts.
