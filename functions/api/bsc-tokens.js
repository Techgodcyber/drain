/**
 * Cloudflare Pages Function — server-side proxy for BSCScan.
 * BSCScan has no CORS headers, so the browser can't call it directly.
 * This runs as a Cloudflare Worker and forwards the request server-side.
 *
 * GET /api/bsc-tokens?address=0x...
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const address = url.searchParams.get('address');

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing address' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const resp = await fetch(
      `https://api.bscscan.com/api?module=account&action=tokentx&address=${address}&sort=desc&page=1&offset=200`,
    );
    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to reach BSCScan' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
