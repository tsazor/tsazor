import { compile } from "@tsazor/compiler";

const src = `@page "/probe"
<div class="host">
@if (alertVisible) {
    <Alert Variant="warning" Dismissible="@true" OnDismissed="@alertGone">Warnhinweis</Alert>
} else {
    <Button Variant="outline-secondary" Size="sm" OnClick="@restoreAlert">Restore</Button>
}
</div>
@code {
    private alertVisible = true;
    private alertGone(): void { this.alertVisible = false; }
    private restoreAlert(): void { this.alertVisible = true; }
}`;

const r = compile(src, { className: "Probe", fileName: "probe.tsazor", generateSourceMap: false });
console.log(r.code);