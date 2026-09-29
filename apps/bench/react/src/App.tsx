import { useEffect, useState } from "react";
import { TodoPage } from "./Todo";
import { RowsPage } from "./Rows";

/**
 * Deliberate 3-line hash switch instead of a router dependency — the bench
 * measures framework size, not router size.
 */
export function App() {
  const [hash, setHash] = useState(() => location.hash || "#/todo");
  useEffect(() => {
    const onHash = () => setHash(location.hash || "#/todo");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const isRows = hash.startsWith("#/rows");

  return (
    <>
      <nav className="bench-nav">
        <a href="#/todo" className={isRows ? "" : "active"}>Todo</a>
        <a href="#/rows" className={isRows ? "active" : ""}>Rows</a>
      </nav>
      <main>{isRows ? <RowsPage /> : <TodoPage />}</main>
    </>
  );
}