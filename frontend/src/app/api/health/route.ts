/**
 * Simple health check - no React, no layout. If this works, the server is running.
 */
export async function GET() {
    return Response.json({ ok: true, message: "Server is running" });
}
