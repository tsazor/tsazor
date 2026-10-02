/** Rolls a die — slowly, like a request to a server would. */
export async function rollDie(): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return 1 + Math.floor(Math.random() * 6);
}
