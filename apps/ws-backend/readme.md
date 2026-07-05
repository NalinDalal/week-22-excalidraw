## `ws-backend`

WebSocket server (port 8080) for real-time collaboration. Built with Bun's native WebSocket (`Bun.serve`).

### Structure

```
src/
  index.ts       — server entry, auth, room management, chat relay
```

### Connection

Clients connect via WebSocket with a JWT token as a query parameter:

```
ws://localhost:8080?token=<jwt>
```

The server verifies the JWT against `JWT_SECRET` (env or fallback `"123123"`). Invalid tokens get a `401` response and the connection is rejected.

### Message protocol

All messages are JSON strings. The `type` field determines how each is handled.

#### `join_room`

Adds the client to a room so they receive that room's broadcasts.

```json
{ "type": "join_room", "roomId": 1 }
```

#### `leave_room`

Removes the client from a room.

```json
{ "type": "leave_room", "room": 1 }
```

#### `chat`

Persists the message to PostgreSQL via Prisma, then broadcasts it to every other client in the same room.

```json
{
  "type": "chat",
  "roomId": 1,
  "message": "{\"shape\":{\"type\":\"rect\",\"x\":10,\"y\":20,\"width\":100,\"height\":50}}"
}
```

The `message` field is an opaque string — the server does not inspect its contents. The canvas app uses it to serialize shape data.

**Broadcast shape** (sent to room peers):

```json
{
  "type": "chat",
  "message": "{\"shape\":{...}}",
  "roomId": 1
}
```

### Room model

- Each WebSocket connection stores its own list of room IDs in `ws.data.rooms`
- A global `Set<ServerWebSocket>` (`clients`) tracks all active connections
- When a `chat` message arrives, the server iterates `clients`, checks each client's room list, and sends to matching peers
- On disconnect, the client is removed from the set

### Dependencies

- **`@repo/db`** — Prisma client for persisting chat messages
- **`jsonwebtoken`** — JWT verification on connect

### Env

| Variable   | Default     | Description                |
| ---------- | ----------- | -------------------------- |
| `JWT_SECRET` | `"123123"` | Secret for verifying tokens |

### Scripts

| Command            | Action                            |
| ------------------ | --------------------------------- |
| `bun dev`          | `bun --watch src/index.ts`        |
| `bun run build`    | Bundle to `./dist/index.js`       |
| `bun run start`    | Run bundled output                |
