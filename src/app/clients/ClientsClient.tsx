"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FaBuilding, FaPlus, FaSave, FaPen, FaBan, FaCheck, FaTimes } from "react-icons/fa";
import { createClientAction, updateClientAction, setClientActiveAction } from "@/app/(actions)/clientActions";
import { toast } from "@/lib/toast";
import type { Client } from "@/lib/types";

export default function ClientsClient({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editShortCode, setEditShortCode] = useState("");

  const activeClients = clients.filter((c) => c.active);
  const inactiveClients = clients.filter((c) => !c.active);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !shortCode.trim()) {
      toast.error("Name and short code are both required.");
      return;
    }
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("short_code", shortCode.trim());
    startTransition(async () => {
      const result = await createClientAction(formData);
      if (result.success) {
        toast.success("Client added.");
        setName("");
        setShortCode("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not add client.");
      }
    });
  }

  function startEdit(client: Client) {
    setEditingId(client.id);
    setEditName(client.name);
    setEditShortCode(client.short_code);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(clientId: string) {
    if (!editName.trim() || !editShortCode.trim()) {
      toast.error("Name and short code are both required.");
      return;
    }
    const formData = new FormData();
    formData.set("name", editName.trim());
    formData.set("short_code", editShortCode.trim());
    startTransition(async () => {
      const result = await updateClientAction(clientId, formData);
      if (result.success) {
        toast.success("Client updated.");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update client.");
      }
    });
  }

  function toggleActive(client: Client) {
    startTransition(async () => {
      const result = await setClientActiveAction(client.id, !client.active);
      if (result.success) {
        toast.success(client.active ? "Client deactivated." : "Client reactivated.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update client.");
      }
    });
  }

  function renderRow(client: Client) {
    const isEditing = editingId === client.id;
    return (
      <motion.div
        key={client.id}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
          client.active ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"
        }`}
      >
        {isEditing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="glass-input min-w-0 flex-1 basis-32 px-3 py-1.5 text-sm"
              placeholder="Client name"
            />
            <input
              value={editShortCode}
              onChange={(e) => setEditShortCode(e.target.value)}
              className="glass-input w-24 shrink-0 px-3 py-1.5 text-sm"
              placeholder="Short code"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => saveEdit(client.id)}
              className="shrink-0 p-2 rounded-lg text-accent hover:bg-accent/10 transition-colors"
              title="Save"
            >
              <FaCheck className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="shrink-0 p-2 rounded-lg text-muted hover:bg-gray-100 transition-colors"
              title="Cancel"
            >
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{client.name}</p>
              <p className="text-xs text-muted">
                {client.short_code}
                {!client.active && <span className="ml-2 text-amber-600">Inactive</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => startEdit(client)}
              className="shrink-0 p-2 rounded-lg text-muted hover:bg-gray-100 transition-colors"
              title="Edit"
            >
              <FaPen className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => toggleActive(client)}
              title={client.active ? "Deactivate" : "Reactivate"}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                client.active
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {client.active ? <FaBan className="h-3 w-3" /> : <FaCheck className="h-3 w-3" />}
              {client.active ? "Deactivate" : "Reactivate"}
            </button>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaBuilding className="text-accent" /> Clients
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every client an Eco Matrix project can be billed under. Deactivating a client removes it
        from the Create/Edit Project picker without touching any project that already uses it.
      </p>

      <form
        onSubmit={handleCreate}
        className="glass p-4 mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      >
        <div>
          <label className="text-xs text-muted block mb-1">Client Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shen Milsom & Wilke"
            className="glass-input w-full px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Short Code</label>
          <input
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value.toUpperCase())}
            placeholder="e.g. SMS"
            className="glass-input w-full px-3 py-2.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm shrink-0 disabled:opacity-50"
        >
          <FaPlus className="h-3 w-3" /> <FaSave className="h-3 w-3" /> Add Client
        </button>
      </form>

      {clients.length === 0 ? (
        <div className="glass p-10 text-center text-muted">
          <FaBuilding className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          No clients yet — add the first one above.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {activeClients.map(renderRow)}
            {inactiveClients.map(renderRow)}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
