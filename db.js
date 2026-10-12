// Chat storage in SQLite (data/chats.db).
// Each conversation belongs to one owner id ("owner" for you, a guest's email otherwise).

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "chats.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY,
    owner       TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_owner
    ON conversations(owner, updated_at);

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT    NOT NULL,          -- user | assistant | tool
    content         TEXT    NOT NULL DEFAULT '',
    tool_name       TEXT,                      -- tool rows: which tool ran
    tool_args       TEXT,                      -- tool rows: JSON arguments
    tool_calls      TEXT,                      -- assistant rows: JSON tool calls
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
`);

const q = {
  list: db.prepare(
    "SELECT id, title, updated_at FROM conversations WHERE owner = ? ORDER BY updated_at DESC LIMIT 100"
  ),
  get: db.prepare("SELECT id, title FROM conversations WHERE id = ? AND owner = ?"),
  create: db.prepare(
    "INSERT INTO conversations (owner, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ),
  remove: db.prepare("DELETE FROM conversations WHERE id = ? AND owner = ?"),
  touch: db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?"),
  addMessage: db.prepare(`
    INSERT INTO messages (conversation_id, role, content, tool_name, tool_args, tool_calls, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  display: db.prepare(
    "SELECT role, content, tool_name, tool_args FROM messages WHERE conversation_id = ? ORDER BY id"
  ),
  recent: db.prepare(`
    SELECT role, content, tool_name, tool_calls FROM messages
    WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`),
};

export function listConversations(owner) {
  return q.list.all(owner);
}

export function getConversation(id, owner) {
  return q.get.get(Number(id), owner) || null;
}

export function createConversation(owner, title) {
  const now = Date.now();
  const info = q.create.run(owner, title, now, now);
  return { id: Number(info.lastInsertRowid), title };
}

export function deleteConversation(id, owner) {
  return q.remove.run(Number(id), owner).changes > 0;
}

export function touchConversation(id) {
  q.touch.run(Date.now(), id);
}

export function addMessage(conversationId, msg) {
  q.addMessage.run(
    conversationId,
    msg.role,
    msg.content || "",
    msg.tool_name ?? null,
    msg.tool_args ? JSON.stringify(msg.tool_args) : null,
    msg.tool_calls?.length ? JSON.stringify(msg.tool_calls) : null,
    Date.now()
  );
}

// Messages for the chat UI
export function displayMessages(conversationId) {
  return q.display.all(conversationId).map((r) => ({
    role: r.role,
    content: r.content,
    tool_name: r.tool_name,
    tool_args: r.tool_args ? JSON.parse(r.tool_args) : undefined,
  }));
}

// The last `limit` messages in the format Ollama expects.
// Starts at a user message so a tool result is never cut off from its call.
export function historyForModel(conversationId, limit) {
  const rows = q.recent.all(conversationId, limit).reverse();
  while (rows.length && rows[0].role !== "user") rows.shift();
  return rows.map((r) => {
    const m = { role: r.role, content: r.content };
    if (r.tool_name) m.tool_name = r.tool_name;
    if (r.tool_calls) m.tool_calls = JSON.parse(r.tool_calls);
    return m;
  });
}