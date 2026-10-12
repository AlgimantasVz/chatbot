// Minimal personal AI agent on top of a local Ollama model.
// Zero dependencies: needs Node 18+ (built-in fetch) and Ollama running.
//
// OLLAMA_MODEL=qwen3:14b node agent.js

import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import fs from "node:fs"
import path from "node:path"
import { tools, runTool, MEMORY_FILE } from "./tools.js"
 
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434"
const MODEL = process.env.OLLAMA_MODEL || "qwen3:14b"
const MAX_TOOL_ROUNDS = 6;   // stop runaway loops
const MAX_HISTORY = 30;      // keep the context small for a local model

function systemPrompt() {
  const memory = fs.existsSync(MEMORY_FILE)
    ? fs.readFileSync(MEMORY_FILE, "utf8").trim()
    : "(nothing yet)";
  return [
    "You are a concise personal assistant running locally on the user's Mac.",
    "Use tools when they help; don't invent tool results.",
    "When the user tells you a lasting fact or preference, save it with the `remember` tool.",
    "",
    "Things you know about the user:",
    memory,
  ].join("\n");
}

async function chat(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message;
}

// The agent loop: ask the model, run any tools it calls, feed results back,
// repeat until it answers in plain text.
async function respond(history) {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const messages = [{ role: "system", content: systemPrompt() }, ...history];
    const msg = await chat(messages);
    history.push(msg);
 
    const calls = msg.tool_calls || [];
    if (calls.length === 0) return msg.content;
 
    for (const call of calls) {
      const { name, arguments: args } = call.function;
      console.log(`  ↳ tool: ${name}(${JSON.stringify(args)})`);
      let result;
      try {
        result = await runTool(name, args || {});
      } catch (err) {
        result = `Error: ${err.message}`;
      }
      history.push({ role: "tool", tool_name: name, content: String(result) });
    }
  }
  return "(Stopped: too many tool calls in a row.)";
}
 
async function main() {
  const rl = readline.createInterface({ input, output });
  const history = [];
  console.log(`Agent ready (model: ${MODEL}). Type 'exit' to quit.\n`);
 
  while (true) {
    let text;
    try {
      text = (await rl.question("you › ")).trim();
    } catch {
      break; // input closed (Ctrl+D)
    }
    if (!text) continue;
    if (text === "exit") break;
 
    history.push({ role: "user", content: text });
    try {
      const answer = await respond(history);
      console.log(`\nai › ${answer}\n`);
    } catch (err) {
      console.error(`\n[error] ${err.message}\n`);
    }
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  }
  rl.close();
}
 
main();