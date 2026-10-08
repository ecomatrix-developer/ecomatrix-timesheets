"use client";

import { useState, useRef, useEffect } from "react";
import { FaSearch, FaTimes, FaPlus, FaCheck, FaFolderOpen, FaChevronDown } from "react-icons/fa";
import type { Project } from "@/lib/types";

interface SearchableProjectSelectProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  disabled?: boolean;
  addedProjectIds: Set<string>;
}

export default function SearchableProjectSelect({
  projects,
  onSelectProject,
  disabled,
  addedProjectIds,
}: SearchableProjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const types = ["All", "Energy Modelling", "BIM and AutoCad"];

  const filteredProjects = projects.filter((p) => {
    // Filter by type pill
    if (selectedType !== "All" && p.project_type !== selectedType) {
      return false;
    }
    // Filter by search query across name, project_number, client_name, project_type
    if (!search.trim()) return true;
    const term = search.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.project_number && p.project_number.toLowerCase().includes(term)) ||
      (p.client_name && p.client_name.toLowerCase().includes(term)) ||
      (p.project_type && p.project_type.toLowerCase().includes(term))
    );
  });

  const handleSelect = (projectId: string) => {
    onSelectProject(projectId);
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`glass-input flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer bg-white transition-all shadow-sm ${
          isOpen ? "ring-2 ring-accent border-accent" : "hover:border-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center gap-2 flex-1 text-sm overflow-hidden">
          <FaSearch className="h-4 w-4 text-accent shrink-0" />
          <span className="text-gray-600 truncate">
            Search & select project by name, project #, client, or category...
          </span>
        </div>
        <FaChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform shrink-0 ml-2 ${
            isOpen ? "rotate-180 text-accent" : ""
          }`}
        />
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 max-h-96 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search Input Box */}
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type project name, number, client, or category..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-gray-50/50"
            />
            <FaSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <FaTimes className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-gray-100 scrollbar-none">
            <span className="text-[11px] font-semibold text-muted shrink-0 mr-1">Category:</span>
            {types.map((type) => {
              const active = selectedType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap border transition-all ${
                    active
                      ? "bg-accent text-white border-accent font-medium shadow-xs"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>

          {/* Options List */}
          <div className="overflow-y-auto max-h-60 space-y-1 pr-1 scrollbar-thin">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((p) => {
                const isAdded = addedProjectIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isAdded
                        ? "bg-emerald-50/60 hover:bg-emerald-100/70 border border-emerald-100"
                        : "hover:bg-accent/10 hover:text-accent border border-transparent"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[80%]">
                      <div className="flex items-center gap-2">
                        {p.project_number && (
                          <span className="font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded text-[10px]">
                            #{p.project_number}
                          </span>
                        )}
                        <span className="font-semibold text-gray-900 truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted text-[11px]">
                        <span>Client: {p.client_name}</span>
                        <span>•</span>
                        <span className="text-violet-600 bg-violet-50 px-1.5 py-0.2 rounded text-[10px]">
                          {p.project_type}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isAdded ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium bg-emerald-100/80 px-2 py-1 rounded-md">
                          <FaCheck className="h-3 w-3" /> In Grid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-accent font-medium bg-white group-hover:bg-accent group-hover:text-white px-2 py-1 rounded-md border border-accent/30 transition-colors">
                          <FaPlus className="h-2.5 w-2.5" /> Add Row
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-muted text-xs">
                <FaFolderOpen className="mx-auto mb-2 h-6 w-6 text-gray-300" />
                No matching projects found for &quot;{search}&quot;.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
