import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../bench.css";

const container = document.getElementById("app")!;
createRoot(container).render(<App />);