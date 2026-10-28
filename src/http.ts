// fetch for the data sources: an error status throws, as requests'
// raise_for_status did in the CLI, and a request that hangs gives up after
// five minutes instead of holding a build open.
export async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000), ...init })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response
}
