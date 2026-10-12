// MCP (Model Context Protocol) support: plug any MCP server in as agent tools.
// Servers are listed in mcp.json (see mcp.example.json). For each server:
//   command/args/env  -> a local server started as a child process (stdio)
//   url/headers       -> a remote server over Streamable HTTP
//   guest: true       -> friends may use its tools too (default: owner only)
//   allow: [...]      -> only expose these tool names (default: all)
//   confirm: ...      -> which tools need your APPROVE click before running:
//                        true (all, the default), false (none), or [tool names]
//   trusted: true     -> its output is safe; reading it doesn't "taint" the turn
//                        (default: untrusted, like web pages)
//   disabled: true    -> skip it
// Tool names become "<server>__<tool>", e.g. files__read_text_file.
//
// Pin package versions in args (e.g. "@modelcontextprotocol/server-filesystem@1.0.0"):
// with `npx -y package` and no version, a compromised new release would run automatically.

import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CONFIG_FILE = path.resolve("mcp.json");
const CONNECT_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS) || 120_000; // the first `npx -y ...` run downloads the package
const CALL_TIMEOUT_MS = 60_000;
const MAX_RESULT_CHARS = 8000;

const clients = [];        // connected MCP clients, closed on shutdown
const definitions = [];    // tool definitions in the format Ollama expects
const index = new Map();   // agent tool name -> { client, tool, server, guest }

const safeName = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "_");

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Keep only the parts of a JSON Schema small local models handle well.
function toParameters(schema) {
  const s = schema && typeof schema === "object" ? schema : {};
  return {
    type: "object",
    properties: s.properties || {},
    ...(Array.isArray(s.required) && s.required.length ? { required: s.required } : {}),
  };
}

export async function startMcp() {
  if (!fs.existsSync(CONFIG_FILE)) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (err) {
    console.error(`MCP: could not read mcp.json: ${err.message}`);
    return;
  }

  const entries = Object.entries(config.servers || {}).filter(([, cfg]) => !cfg.disabled);
  await Promise.all(entries.map(([name, cfg]) => connectServer(name, cfg)));
}

// npx/bunx/pnpm dlx package arguments without an explicit @version
function unpinnedPackages(cfg) {
  if (!cfg.command || !/(^|\/)(npx|bunx|pnpm|uvx)$/.test(cfg.command)) return [];
  return (cfg.args || []).filter((a) => {
    if (a.startsWith("-") || a.startsWith(".") || a.startsWith("/")) return false;
    const bare = a.startsWith("@") ? a.slice(1) : a;
    return /^[a-z0-9][\w.-]*(\/[\w.-]+)?$/i.test(bare) && !bare.includes("@");
  });
}

async function connectServer(name, cfg) {
  const unpinned = unpinnedPackages(cfg);
  if (unpinned.length) {
    console.warn(
      `MCP: ${name}: pin a version for ${unpinned.join(", ")} ` +
        `(e.g. package@1.2.3, or package==1.2.3 with uvx)`
    );
  }
  let transport;
  try {
    transport = cfg.url
      ? new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: { headers: cfg.headers || {} },
        })
      : new StdioClientTransport({
          command: cfg.command,
          args: cfg.args || [],
          cwd: process.cwd(),
          // Only a minimal environment (PATH, HOME, ...) plus what you list:
          // your own secrets like OLLAMA_API_KEY are NOT passed to servers.
          env: { ...getDefaultEnvironment(), ...(cfg.env || {}) },
          stderr: "ignore",
        });

    const client = new Client({ name: "av-agent", version: "0.3.0" });
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connecting to ${name}`);
    clients.push(client);

    const { tools } = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, `listing ${name} tools`);
    let added = 0;
    for (const tool of tools) {
      if (Array.isArray(cfg.allow) && !cfg.allow.includes(tool.name)) continue;
      const agentName = `${safeName(name)}__${safeName(tool.name)}`.slice(0, 64);
      const confirm =
        cfg.confirm === undefined || cfg.confirm === true
          ? true
          : Array.isArray(cfg.confirm)
          ? cfg.confirm.includes(tool.name)
          : false;
      index.set(agentName, {
        client,
        tool: tool.name,
        server: name,
        guest: Boolean(cfg.guest),
        confirm,
        trusted: cfg.trusted === true,
      });
      definitions.push({
        type: "function",
        function: {
          name: agentName,
          description: `[MCP: ${name}] ${tool.description || tool.name}`.slice(0, 1000),
          parameters: toParameters(tool.inputSchema),
        },
      });
      added++;
    }
    console.log(`MCP: ${name} connected, ${added} tool(s)${cfg.guest ? " (guests allowed)" : ""}`);
  } catch (err) {
    console.error(`MCP: ${name} failed to start: ${err.message}`);
    await transport?.close().catch(() => {}); // don't leave a half-started server running
  }
}

export function mcpToolsFor(user) {
  return definitions.filter((d) => user.owner || index.get(d.function.name).guest);
}

export const isMcpTool = (name) => index.has(name);

// Security policy for one MCP tool: does it need approval, is its output untrusted?
export function mcpPolicy(name) {
  const entry = index.get(name);
  return { risky: entry.confirm, untrusted: !entry.trusted };
}

export async function callMcp(name, args) {
  const entry = index.get(name);
  const result = await withTimeout(
    entry.client.callTool({ name: entry.tool, arguments: args }),
    CALL_TIMEOUT_MS,
    `${name}`
  );
  let text = (result.content || [])
    .map((c) => (c.type === "text" ? c.text : `[${c.type} content omitted]`))
    .join("\n")
    .trim();
  if (!text && result.structuredContent) text = JSON.stringify(result.structuredContent);
  if (text.length > MAX_RESULT_CHARS) text = text.slice(0, MAX_RESULT_CHARS) + " …[truncated]";
  return result.isError ? `Error: ${text || "tool failed"}` : text || "(empty result)";
}

export async function stopMcp() {
  await Promise.allSettled(clients.map((c) => c.close()));
}