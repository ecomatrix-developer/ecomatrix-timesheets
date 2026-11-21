"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaSearch, FaFileAlt, FaUserCircle, FaChevronRight } from "react-icons/fa";
import type { PublicUser } from "@/lib/types";

export default function ManageDocumentsIndexClient({
  users,
  counts,
}: {
  users: PublicUser[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term)
    );
  }, [users, search]);

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <FaFileAlt className="text-accent" /> Upload Documents
      </h1>
      <p className="text-sm text-muted mb-6">
        A consolidated view of every employee and how many documents are on file for them. Open
        an employee to upload, view, or delete their documents — only that employee and Super
        Admin can ever see them.
      </p>

      <div className="relative mb-4 max-w-md">
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, username, or email..."
          className="glass-input w-full pl-9 pr-3 py-2.5 text-sm"
        />
      </div>

      <div className="glass !p-0 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">No matching employees.</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/manage_documents/${u.id}`)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                  <FaUserCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{u.name}</p>
                  <p className="text-xs text-muted truncate">
                    {u.username}
                    {u.email ? ` · ${u.email}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                    (counts[u.id] ?? 0) > 0
                      ? "bg-accent/10 text-accent"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {counts[u.id] ?? 0} doc{(counts[u.id] ?? 0) === 1 ? "" : "s"}
                </span>
                <FaChevronRight className="shrink-0 h-3 w-3 text-gray-400" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
