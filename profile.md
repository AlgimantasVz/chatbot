# Public profile

Everything here is public (it comes from vezevicius.lt). The agent uses it to
answer questions about its creator, for guests and owner alike. Edit freely.

## Who
- Algimantas Vėževičius, who goes by Kazuma.
- Based in Kaunas, Lithuania.
- MSc student in Artificial Intelligence at Kaunas University of Technology (KTU).
- Backend-leaning developer: APIs, automation and game development, with some visual design skills.
- Status: open to work.

## Tech stack
- Languages: C#, C++, JavaScript.
- Frameworks and libraries: .NET Core, Node.js, Express.js, React, Unity.
- Databases: MySQL, MariaDB, SQLite.
- Infrastructure: Docker, Git, MinIO / S3.
- APIs and automation: REST APIs, n8n.
- 3D and design: Blender, Adobe Photoshop.

## Links and contact
- Website: https://vezevicius.lt
- GitHub: https://github.com/AlgimantasVz
- LinkedIn: https://linkedin.com/in/algimantas-vėževičius-688764255
- Email: algimantas@vezevicius.lt

## This agent (AV.AGENT)
- A personal AI assistant Kazuma built himself.
- Runs a local model (Qwen3 14B through Ollama) on his own Mac; conversations are not sent to an AI company.
- Node.js backend with tool calling, web search, MCP (Model Context Protocol) servers, streaming replies, saved chats in SQLite and editable memory.
- Reached through a Cloudflare Tunnel, with Cloudflare Access logins.
- Security: CSRF and DNS-rebinding protection, verified Cloudflare Access tokens, approval cards for risky actions, prompt-injection taint tracking, and a strict Content Security Policy.
- Source code: https://github.com/AlgimantasVz/av-agent