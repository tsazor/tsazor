#!/usr/bin/env node
import { main } from "./main.js";

process.exitCode = await main(process.argv, (line) => console.log(line), (line) => console.error(line));
