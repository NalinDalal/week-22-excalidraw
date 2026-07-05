## `http-backend`

REST API server (port 3001) for user auth and room management. Built with `Bun.serve()` — zero frameworks.

### Structure

```
src/
  index.ts      — server entry, route table
  auth.ts       — signup / signin
  room.ts       — room CRUD + chat history
  middleware.ts  — JWT verification
  response.ts   — CORS + JSON response helper
```

### Routes

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/signup` | No | `signupHandler` | Create account (bcrypt hash via `Bun.password`) |
| POST | `/signin` | No | `signinHandler` | Login, returns JWT |
| POST | `/room` | Yes (header) | `createRoomHandler` | Create a room |
| GET | `/chats/:roomId` | No | `getChatsHandler` | Last 1000 chat messages for a room |
| GET | `/room/:slug` | No | `getRoomHandler` | Get room by slug |

### Request/Response shapes

**POST /signup**
```json
// req
{ "username": "foo", "password": "bar", "name": "Foo" }
// res 200
{ "userId": "uuid" }
// res 411
{ "message": "User already exists with this username" }
```

**POST /signin**
```json
// req
{ "username": "foo", "password": "bar" }
// res 200
{ "token": "jwt..." }
// res 403
{ "message": "Not authorized" }
```

**POST /room** (requires `Authorization: <token>` header)
```json
// req
{ "name": "my-room" }
// res 200
{ "roomId": 1 }
```

**GET /chats/:roomId**
```json
// res 200
{ "messages": [{ "id": 1, "roomId": 1, "message": "...", "userId": "..." }] }
```

**GET /room/:slug**
```json
// res 200
{ "room": { "id": 1, "slug": "my-room", "adminId": "..." } }
```

### Auth flow

1. Signup → password hashed with `Bun.password.hash()` (bcrypt, cost 10), user stored in PostgreSQL
2. Signin → password verified with `Bun.password.verify()`, JWT signed with `jsonwebtoken` using `JWT_SECRET` (env or fallback `"123123"`)
3. Protected routes → `middleware()` extracts `Authorization` header, verifies JWT, returns `userId` or `null`

### Dependencies

- **`@repo/db`** — Prisma client (User, Room, Chat models)
- **`jsonwebtoken`** — JWT sign/verify
- **`zod`** — Request body validation

### Env

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `"123123"` | Secret for signing tokens |

### Scripts

| Command | Action |
|---------|--------|
| `bun dev` |  `bun --watch src/index.ts` |
| `bun run build` | Bundle to ` ./dist/index.js` |
| `bun run start` | Run bundled output |


