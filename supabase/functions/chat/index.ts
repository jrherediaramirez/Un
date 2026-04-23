// Edge Function: POST /chat
// Real implementation lands in M3. This stub lets the supabase CLI
// serve the function locally so we can wire env/secrets in M1.
Deno.serve((_req) => {
  return new Response(
    JSON.stringify({ error: "not_implemented", milestone: "M3" }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
});
