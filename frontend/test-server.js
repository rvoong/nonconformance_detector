#!/usr/bin/env node
/**
 * Minimal HTTP server - no Next.js. Run: node test-server.js
 * If you see "Hello" at http://localhost:3999, your machine can serve HTTP.
 */
const http = require("http");
const port = 3999;
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Hello</h1><p>If you see this, HTTP works.</p>");
});
server.listen(port, () => {
    console.log(`Test server: http://localhost:${port}`);
});
