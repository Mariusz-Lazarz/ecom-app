import "server-only"

import { connection } from "next/server"

import { query } from "@/lib/db"

export type Category = {
  id: string
  slug: string
  name: string
  icon: string
}

export async function listCategories() {
  // Categories live in the database, so never bake them into a build-time prerender.
  await connection()
  const { rows } = await query<Category>("SELECT id, slug, name, icon FROM categories ORDER BY position, name")
  return rows
}
