import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { error } = await supabaseAdmin.from("users").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", message: "Service is running and database is connected." });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: "Database connection failed.", error_details: String(err) },
      { status: 503 }
    );
  }
}
