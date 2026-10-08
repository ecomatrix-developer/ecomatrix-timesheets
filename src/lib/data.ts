import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { Project, PublicUser, User } from "./types";

export async function getAllUsers(): Promise<PublicUser[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, mongo_id, username, name, role, created_at, updated_at")
    .order("name");
  if (error) throw error;
  return data as PublicUser[];
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data as User | null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, mongo_id, username, name, role, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PublicUser | null;
}

export async function getAllProjects(): Promise<Project[]> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

/** Build a lookup map id -> Project for fast joins in memory. */
export function toProjectMap(projects: Project[]): Record<string, Project> {
  const map: Record<string, Project> = {};
  for (const p of projects) map[p.id] = p;
  return map;
}

export function toUserMap(users: PublicUser[]): Record<string, PublicUser> {
  const map: Record<string, PublicUser> = {};
  for (const u of users) map[u.id] = u;
  return map;
}
