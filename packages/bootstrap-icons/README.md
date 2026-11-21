# @tsazor/bootstrap-icons

[Bootstrap Icons](https://icons.getbootstrap.com/) as typed icon values for Tsazor:

```razor
@import * as Icons from "@tsazor/bootstrap-icons"

<Icon Value="@Icons.Alarm" />
```

A bundler keeps only the icons a page uses. Each icon is an `IconValue` of `@tsazor/ui`. A name that starts with a
digit gets `Number` in front: `0-circle` is `Icons.Number0Circle`.

Generated from [`bootstrap-icons`](https://www.npmjs.com/package/bootstrap-icons): MIT License, Copyright (c)
2019-2024 The Bootstrap Authors.
