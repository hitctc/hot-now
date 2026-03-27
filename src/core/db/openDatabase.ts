import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export function openDatabase(file: string): SqliteDatabase {
  // Opening the SQLite file is the earliest point where we can safely create the folder structure
  // for first boot, so callers do not need separate filesystem bootstrap logic.
  // The unified site stores everything in one local SQLite file, so opening it also
  // ensures the parent directory exists for first-run bootstrap.
  mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
