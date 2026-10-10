// firebase-tools 15.30's API client ignores NO_PROXY and forces ProxyAgent even
// for Hosting -> Functions emulator traffic. Bypass that agent ONLY for local
// HTTP emulator sockets; retain the inherited proxy for every remote request.
// Test-runner preload only: never loaded by deployed application code.
import { Agent, ProxyAgent } from "undici";
const loopback = new Agent();
const dispatch = ProxyAgent.prototype.dispatch;
ProxyAgent.prototype.dispatch = function (options, handler) {
  const url = new URL(String(options.origin));
  if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return loopback.dispatch(options, handler);
  }
  return dispatch.call(this, options, handler);
};
