# YobFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

Playwright, Chromium at three viewports, against the in-browser mock API.

```bash
npm run e2e
```

That is the **authoritative gate**: it starts its own mock server on port 4301 from the
current working tree and never reuses one that is already running, so a result can always
be trusted to describe the code in front of you.

For a fast local loop, start a mock server yourself and reuse it:

```bash
npm run start:mock
```

```bash
npm run e2e:dev
```

`e2e:dev` talks to whatever answers on port 4300. It is convenient, and it is not a gate:
a dev server that has stopped rebuilding will answer it with stale code. Every run prints
which mode it is in, and `e2e/gate-integrity.spec.ts` pins the difference.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
