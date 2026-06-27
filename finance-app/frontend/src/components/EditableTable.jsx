import { useState, useRef, useEffect, useCallback } from "react";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 2 }) ?? "";

/**
 * Reusable editable table with add / edit / delete + export.
 *
 * Double-click a row to edit. Esc to cancel. Enter to save.
 * No spinners on number fields — plain text inputs everywhere.
 */
export default function EditableTable({
  columns,
  data,
  onSave,
  onCreate,
  onDelete,
  exportEntity,
  title,
  defaultNew = {},
  defaultSort = null,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [newRow, setNewRow] = useState({});
  const [flash, setFlash] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? "desc");
  const addRef = useRef(null);
  const editRef = useRef(null);

  useEffect(() => {
    if (isAdding && addRef.current) {
      addRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isAdding]);

  // Focus first editable input when entering edit mode
  useEffect(() => {
    if (editingId && editRef.current) {
      const firstInput = editRef.current.querySelector("input, select");
      if (firstInput) firstInput.focus();
    }
  }, [editingId]);

  // Global Esc handler to cancel editing
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (editingId) { setEditingId(null); setEditRow({}); }
        if (isAdding) { setIsAdding(false); setNewRow({}); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [editingId, isAdding]);

  const doFlash = (id, type) => {
    setFlash({ id, type });
    setTimeout(() => setFlash(null), 1200);
  };

  const startEdit = useCallback((row) => {
    setEditingId(row.id);
    const vals = {};
    columns.forEach((c) => { vals[c.key] = row[c.key] ?? ""; });
    setEditRow(vals);
  }, [columns]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onSave(editingId, editRow);
      doFlash(editingId, "success");
      setEditingId(null);
    } catch {
      doFlash(editingId, "error");
    }
    setSaving(false);
  };

  const startAdd = () => {
    setIsAdding(true);
    const defaults = {};
    columns.forEach((c) => {
      defaults[c.key] = defaultNew[c.key] ?? (c.type === "number" ? 0 : "");
    });
    setNewRow(defaults);
  };

  const saveNew = async () => {
    setSaving(true);
    try {
      const created = await onCreate(newRow);
      doFlash(created?.id ?? "new", "success");
      setIsAdding(false);
      setNewRow({});
    } catch {
      doFlash("new", "error");
    }
    setSaving(false);
  };

  const confirmDelete = async (id) => {
    setSaving(true);
    try {
      await onDelete(id);
      setDeleteConfirm(null);
    } catch {
      doFlash(id, "error");
    }
    setSaving(false);
  };

  const handleRowKeyDown = (e, isNew) => {
    if (e.key === "Enter") {
      e.preventDefault();
      isNew ? saveNew() : saveEdit();
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default new sort: numbers & dates descending, text ascending
      const col = columns.find((c) => c.key === key);
      setSortDir(col?.type === "number" || col?.type === "date" ? "desc" : "asc");
    }
  };

  const sortedData = (() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    const arr = [...data];
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (col?.type === "number") return sortDir === "asc" ? va - vb : vb - va;
      va = String(va); vb = String(vb);
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  })();

  const renderCell = (col, value, onChange) => {
    const base =
      "bg-surface-hover/50 border border-line rounded px-2 py-1 text-xs text-content " +
      "focus:outline-none focus:ring-1 focus:ring-accent/60 w-full " +
      "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

    if (col.type === "select") {
      return (
        <select className={base} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">--</option>
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (col.type === "number") {
      return (
        <input type="number" step="any" className={base + " text-right font-mono"}
          value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))} />
      );
    }
    if (col.type === "date") {
      return (
        <input type="date" className={base + " font-mono"}
          value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    }
    return (
      <input type="text" className={base}
        value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    );
  };

  const flashClass = (id) => {
    if (!flash || flash.id !== id) return "";
    return flash.type === "success"
      ? "bg-green-900/30 transition-colors"
      : "bg-red-900/30 transition-colors";
  };

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-content hover:text-accent transition-colors">
          <svg className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {title}
          <span className="text-xs text-content-muted font-normal">({data.length})</span>
        </button>
        <div className="flex items-center gap-2">
          {exportEntity && (
            <div className="relative group">
              <button className="text-xs text-content-muted hover:text-content-secondary px-2 py-1 rounded border border-line hover:border-line transition-colors">
                Export ↓
              </button>
              <div className="absolute right-0 top-full mt-1 bg-base border border-line rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <a href={`/api/export/${exportEntity}?format=csv`}
                  className="block px-4 py-2 text-xs text-content-secondary hover:text-accent hover:bg-surface-hover whitespace-nowrap"
                  download>CSV</a>
                <a href={`/api/export/${exportEntity}?format=xlsx`}
                  className="block px-4 py-2 text-xs text-content-secondary hover:text-accent hover:bg-surface-hover whitespace-nowrap"
                  download>Excel</a>
              </div>
            </div>
          )}
          {!isAdding && (
            <button onClick={startAdd}
              className="text-xs bg-accent/80 hover:bg-accent-hover text-white px-3 py-1 rounded transition-colors">
              + Add
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c.key}
                    className="px-3 py-2 text-left text-content-muted font-medium cursor-pointer select-none hover:text-content-secondary transition-colors group"
                    style={c.width ? { width: c.width } : {}}
                    onClick={() => toggleSort(c.key)}>
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sortKey === c.key ? (
                        <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {/* New row form */}
              {isAdding && (
                <tr ref={addRef}
                  className={`border-b border-accent/30 bg-accent/15 ${flashClass("new")}`}
                  onKeyDown={(e) => handleRowKeyDown(e, true)}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-1.5">
                      {renderCell(c, newRow[c.key], (v) => setNewRow({ ...newRow, [c.key]: v }))}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5 items-center">
                      <button onClick={saveNew} disabled={saving}
                        className="text-[10px] font-semibold text-accent hover:text-accent disabled:opacity-40">
                        Save
                      </button>
                      <span className="text-content-muted">|</span>
                      <button onClick={() => { setIsAdding(false); setNewRow({}); }}
                        className="text-[10px] text-content-muted hover:text-content-secondary">
                        Esc
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {sortedData.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id}
                    ref={isEditing ? editRef : undefined}
                    className={`border-b border-line/50 transition-colors ${flashClass(row.id)} ${
                      isEditing ? "bg-surface-hover/30" : "hover:bg-surface-hover/20 cursor-pointer"
                    }`}
                    onDoubleClick={() => { if (!isEditing) startEdit(row); }}
                    onKeyDown={(e) => { if (isEditing) handleRowKeyDown(e, false); }}>
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-1.5">
                        {isEditing && c.editable !== false ? (
                          renderCell(c, editRow[c.key], (v) => setEditRow({ ...editRow, [c.key]: v }))
                        ) : (
                          <span className={`${c.type === "number" ? "font-mono text-right block" : ""} text-content-secondary`}>
                            {c.type === "number" ? fmt(row[c.key]) : (row[c.key] ?? "--")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      {isEditing ? (
                        <div className="flex gap-1.5 items-center">
                          <button onClick={saveEdit} disabled={saving}
                            className="text-[10px] font-semibold text-accent hover:text-accent disabled:opacity-40">
                            Save
                          </button>
                          <span className="text-content-muted">|</span>
                          <button onClick={() => { setEditingId(null); setEditRow({}); }}
                            className="text-[10px] text-content-muted hover:text-content-secondary">
                            Esc
                          </button>
                        </div>
                      ) : deleteConfirm === row.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => confirmDelete(row.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 font-semibold">Yes</button>
                          <span className="text-content-muted">|</span>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] text-content-muted hover:text-content-secondary">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(row.id)}
                          className="text-content-muted hover:text-red-400 transition-colors" title="Delete">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {data.length === 0 && !isAdding && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-content-muted text-sm">
                    No data yet. Click <span className="text-accent">+ Add</span> to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
