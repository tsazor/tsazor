# @tsazor/fluent-icons

The [Fluent System Icons](https://github.com/microsoft/fluentui-system-icons) as typed icon values for Tsazor,
written as Fluent UI Blazor writes them:

```razor
@import * as Icons from "@tsazor/fluent-icons"

<Icon Value="@Icons.Regular.Size20.Save" />
```

Every variant (`Regular`, `Filled`, `Light`, `Color`) and size (`Size10` … `Size48`) is its own module, so a bundler
keeps only the icons a page uses. Each icon is an `IconValue` of `@tsazor/ui`. Ported from Fluent UI Blazor:
`new Icons.Regular.Size20.Save()` becomes `Icons.Regular.Size20.Save`.

Generated from [`@fluentui/svg-icons`](https://www.npmjs.com/package/@fluentui/svg-icons): MIT License, Copyright (c)
2020 Microsoft Corporation.
