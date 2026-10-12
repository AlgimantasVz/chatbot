# AV.AGENT

A little side project I built for myself to try out [Ollama](https://ollama.com) and see how far a local model can go as a personal assistant.

Everything runs on my own Mac: the model (Qwen3 14B), the chats and the memory. It started as a 50-line terminal script and slowly grew into a small web app styled like my website, [vezevicius.lt](https://vezevicius.lt).

![Start screen](docs/start.png)

## What it can do

- Chat with a local model, with replies streaming in live
- Use tools: check the time, take notes, remember things about me, search the web
- Connect MCP servers for extra tools
- Answer questions about me, so friends can ask it who I am
- Ask before doing anything that changes data

![A chat with tool calls](docs/chat.png)

![Approval card before a risky action](docs/approval.png)

<p align="center">
  <img src="docs/mobile.png" alt="Mobile view" width="300">
</p>

## Built with

Node.js, Ollama, SQLite, Cloudflare Tunnel and plain HTML/CSS/JS.

Just a fun project, not production software.