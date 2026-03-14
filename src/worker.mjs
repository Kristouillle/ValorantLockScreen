const BACKEND_ORIGIN = "https://api.bestafter.ca";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === "/simulate" ||
      url.pathname.startsWith("/simulate/") ||
      url.pathname.startsWith("/api/")
    ) {
      return proxyToBackend(request, url);
    }

    return env.ASSETS.fetch(request);
  }
};

function proxyToBackend(request, url) {
  const backendURL = new URL(url.pathname + url.search, BACKEND_ORIGIN);

  const proxiedRequest = new Request(backendURL, request);
  proxiedRequest.headers.set("x-forwarded-host", url.host);
  proxiedRequest.headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  return fetch(proxiedRequest, {
    redirect: "manual"
  });
}
