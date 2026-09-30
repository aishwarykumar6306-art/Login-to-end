import mysql from "mysql2/promise";
import { env } from "../config/env";

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (pool) return pool;

  pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
    namedPlaceholders: true,
  });

  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params as any);
  return rows as unknown as T[];
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params?: unknown[]
): Promise<{ affectedRows: number; insertId: number }> {
  const pool = getPool();
  const [result] = await pool.execute(sql, params as any);
  const anyResult = result as unknown as {
    affectedRows: number;
    insertId: number;
  };
  return {
    affectedRows: anyResult.affectedRows,
    insertId: anyResult.insertId,
  };
}

export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}