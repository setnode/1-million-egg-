import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pgTable, text, integer, bigint, uuid, index, unique, timestamp } from "drizzle-orm/pg-core";

// Define needed schemas locally so indexer can run completely isolated from the web app
export const playerFid = pgTable("app_PlayerFid", {
  address: text("address").primaryKey(),
  fid: integer("fid").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationToken = pgTable("app_NotificationToken", {
  fid: integer("fid").primaryKey(),
  notificationUrl: text("notificationUrl").notNull(),
  notificationToken: text("notificationToken").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationQueue = pgTable("app_NotificationQueue", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerAddress: text("playerAddress").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  sendAt: bigint("sendAt", { mode: "number" }).notNull(),
  retryCount: integer("retryCount").notNull().default(0),
}, (table) => ([
  index("idx_nq_status_send_at").on(table.status, table.sendAt),
  unique("uq_nq_player_type_send_at").on(table.playerAddress, table.type, table.sendAt),
]));

// Initialize postgres client for Indexer/Worker
const connectionString = process.env.DATABASE_URL || '';
const client = connectionString ? postgres(connectionString, { max: 5 }) : null;

export const db = client ? drizzle(client, { schema: { playerFid, notificationToken, notificationQueue } }) : null;
