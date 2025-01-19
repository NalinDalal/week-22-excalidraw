# Excalidraw

This is an official Excalidraw App.

Run the following command:

```sh
> npm create turbo
? Where would you like to create your Turborepo? excalidraw
? Which package manager do you want to use? pnpm
```
Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

create 3 folder `http-backend`,`ws-backend`
initialise package.json in them

2 http layer, 1 for auth/http; 1 for websocket

http-> signup, signin, create-room

PostGresDB: use entry for msg and rooms

use ts, don't do automatic instead do use packages; but avoid code duplication;
extend base.json into ws-backend and http-backend;
we are using pnpm so use 'workspace:*' add this dependency in both places


1. Initialized an empty turborepo
2. Deleted the docs app
3. Added http-server, ws-server
4. Added package.json in both the places-> `npm init -y`
5. Added tsconfig.json in both the places, and imported it from @repo/typescript-config/base.json-> `npx tsc --init`
6. Added @repo/typescript-config as a dependency in both ws-server and http-server


7. Added a build, dev and start script to both the projects-> `package.json`
8. Update the turbo-config in both the projects (optional)
9. Initialize a http server, Initialize a websocket server

10. Write the signup, signin, create-room endpoint -> `apps/http-backend`
11. Write the middlewares that decode the token and gate the create-room ep->
    `http-backend/src/middleware.ts`
12. Decode the token in the websocket server as well. Send the token to the websocket server in a query param for now; have to send query params-> `ws-backend/src/index.ts, config.ts`
13. Initialize a new 'db' package where you write the schema of the project.
14. Import the db package in http layer and start putting things in the DB
15. Add a bakend-common package where we add the zod schema and the JWT_SECRET in
    packages-> common/types.ts, import in main backend
16. add common in packages for frontend; add zod

18.01,2025
Getting more things done
started frontend with next, app router, tailwind css

update ws-backend, also we built the canvas

now say chat has text or draw so it's same, add this to frontend
### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
npm build
```

done with everything

Assignment
Complete pencil functionality Add panning and zooming functionality


