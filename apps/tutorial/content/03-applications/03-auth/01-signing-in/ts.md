---
title: Signing in
focus: BakeryAuth.ts
gate: click .user button
---

The bakery wants to know its customers. The header now has a Sign in button, but clicking it
does nothing. Let's fix that.

Somebody has to know who's signed in. In Tsazor that's an **authentication state provider**:
a service that answers "who is the user?" and tells the app when the answer changes. The
app's provider is `BakeryAuth.ts`, and `Program.ts` already registers it.

`getState()` answers the question; right now it always says "nobody". Fill in `signIn`:

```ts
signIn(name: string) {
    this.current = new AuthenticationState(createUser({ name }));
    this.notifyAuthenticationStateChanged(this.current);
}
```

`createUser` builds a signed-in user, and `notifyAuthenticationStateChanged` tells everyone
who's listening — that's how the header finds out. Add `createUser` to the import at the top,
then write `signOut` the same way, with `ANONYMOUS` as the new state.

Click Sign in: "Hi, Marta" appears. Sign out, and the button is back.

Leave out the notification and try again: the provider knows about Marta, but the header
never hears about it.

This provider keeps the user in memory. A real one asks your server who's signed in, usually
via a cookie the server set at login. Keep tokens and passwords out of the browser's storage
— the server knows who's signed in, the provider just passes it on.
