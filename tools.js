// Tool definitions (what the model sees) + implementations (what actually runs).
// Add a new tool by adding a schema to `tools` and a case to `runTool`.

import fs from "node:fs"
import path from "node:path"

const DATA_DIR = path.resolve("data")
const NOTES_DIR = path.join(DATA_DIR, "notes")
export const MEMORY_FILE = path.join(DATA_DIR, "memory.md")
fs.mkdirSync(NOTES_DIR, { recursive: true })

export const tools = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current local date and time.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Save a lasting fact or preference about the user to long-term memory.",
      parameters: {
        type: "object",
        properties: { fact: { type: "string", description: "One short fact." } },
        required: ["fact"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "List the user's saved notes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_note",
      description: "Read one note by its file name.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "e.g. shopping.md" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_note",
      description: "Create or overwrite a note.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name, e.g. ideas.md" },
          content: { type: "string" },
        },
        required: ["name", "content"],
      },
    },

    
  },
];

// Never trust paths from the model: keep every file inside NOTES_DIR.
function safeNotePath(name) {
  const p = path.resolve(NOTES_DIR, String(name));
  if (!p.startsWith(NOTES_DIR + path.sep)) throw new Error("Invalid note name.");
  return p;
}

export async function runTool(name, args) {
  switch (name) {
    case "get_current_time":
      return new Date().toString()

    case "remember":
      fs.appendFileSync(MEMORY_FILE, `- ${String(args.fact).trim()}\n`)
      return "Saved."

    case "list_notes": {
      const files = fs.readdirSync(NOTES_DIR)
      return files.length ? files.join("\n") : "No notes yet."
    }

    case "read_note":
      return fs.readFileSync(safeNotePath(args.name), "utf8")

    case "write_note":
      fs.writeFileSync(safeNotePath(args.name), String(args.content))
      return `Wrote ${args.name}.`

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}