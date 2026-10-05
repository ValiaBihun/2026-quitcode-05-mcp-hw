// LeadDesk MCP server over stdio: what Claude Code and the Inspector start.
//
//   node src/server.mjs                                        fixture next to the module
//   LEADDESK_FIXTURE=/path/to/leads.json node src/server.mjs   another copy of the same data
//
// Tools and the resource live in leaddesk.mjs. stdout is the protocol channel: nothing may print to it.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { factory } from "./leaddesk.mjs";

await serveStdio(factory);
