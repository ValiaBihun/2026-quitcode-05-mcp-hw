// LeadDesk MCP server over HTTP (bonus E1): the same factory as the stdio server, bound to loopback only.
//
//   node src/http.mjs            listens on http://127.0.0.1:3333/mcp
//
// node:http has no middleware chain, so the Host and Origin guards are called by hand in the request
// handler, before the MCP handler. toNodeHandler has no option for them (its options are only onerror and
// maxRequestBodySize), so passing them there would be silently ignored. A guard answers a rejected request
// with 403 itself and returns false: the handler must not touch the request after that.
// stdout is not a protocol channel here, but the rule of this package stays: logs go to stderr only.
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from "@modelcontextprotocol/node";
import { factory } from "./leaddesk.mjs";

const HOST = "127.0.0.1"; // loopback only, never all interfaces: the server has no authentication
const PORT = Number(process.env.LEADDESK_HTTP_PORT ?? 3333);

const mcp = toNodeHandler(createMcpHandler(factory), {
  onerror: (error) => console.error(`[leaddesk-http] handler error: ${error.name}`),
});
const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();

const server = createServer(async (req, res) => {
  if (!checkHost(req, res)) return; // forged Host (DNS rebinding): the guard already sent 403
  if (!checkOrigin(req, res)) return; // foreign Origin (a web page calling us from the browser): 403 as well
  await mcp(req, res);
});

server.on("error", (error) => {
  console.error(`[leaddesk-http] ${error.code === "EADDRINUSE" ? `port ${PORT} is busy` : error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.error(`[leaddesk-http] listening on http://${HOST}:${PORT}/mcp (Host and Origin guards on)`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.error(`[leaddesk-http] stopping (${signal})`);
    server.close();
    process.exit(0);
  });
}
