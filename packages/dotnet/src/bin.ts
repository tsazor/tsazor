#!/usr/bin/env node
import { main } from "./cli.js";

process.exitCode = await main(process.argv, (line) => console.log(line));