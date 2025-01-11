# Excalidraw

This is an official Excalidraw App.

## Using this example

Run the following command:

```sh
> pnpm create turbo
? Where would you like to create your Turborepo? excalidraw
? Which package manager do you want to use? pnpm
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

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


### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
pnpm build
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo
pnpm dev
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo
npx turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
npx turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)
- [Caching](https://turbo.build/repo/docs/core-concepts/caching)
- [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [Filtering](https://turbo.build/repo/docs/core-concepts/monorepos/filtering)
- [Configuration Options](https://turbo.build/repo/docs/reference/configuration)
- [CLI Usage](https://turbo.build/repo/docs/reference/command-line-reference)
