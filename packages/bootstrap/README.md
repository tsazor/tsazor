# @tsazor/bootstrap

[Bootstrap 5](https://getbootstrap.com/) components for [Tsazor](https://github.com/tsazor/tsazor#readme), written in `.tsazor`: buttons,
forms and inputs, dialogs, menus, tabs, a DataGrid in the manner of QuickGrid, date and time pickers, toasts,
and the rest of the library — the same components and parameters as [`@tsazor/fluent`](https://www.npmjs.com/package/@tsazor/fluent), in Bootstrap's
look.

```bash
npm install @tsazor/bootstrap bootstrap
```

`npm create tsazor@latest my-app -- --ui @tsazor/bootstrap` sets it up. By hand: in `Program.ts`,

```ts
import "bootstrap/dist/css/bootstrap.min.css";
import "@tsazor/bootstrap/tsazor-bootstrap.css";
import { addBootstrap } from "@tsazor/bootstrap";

// services: (services) => addBootstrap(services),
```

`@using @tsazor/bootstrap` in `_Imports.tsazor`, and a `<ToastRegion />` in your `MainLayout` for toasts.
