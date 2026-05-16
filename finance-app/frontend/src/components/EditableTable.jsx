import { useState, useRef, useEffect } from "react";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 2 }) ?? "";

/**
 * Reusable editable table with add / edit / delete + export.
 *
 * Props:
 *  columns  - [{ key, label, type: "text"|"number"|"date"|"select", options?, editable?, width? }]
 *  data     - array of row objects (must have `id`)
 *  onSave   - (id, updatedRow) => Promise
 *  onCreate - (newRow) => Promise  (return the created row with id)
 *  onDelete - (id) => Promise
 *  exportEntity - string entity name for /api/export/{entity}
 *  title    - section header text
 *  defaultNew - default values for a new row
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
}) {
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [newRow, setNewRow] = useState({});
  const [flash, setFlash] = useState(null); // { id, type: "success"|"error" }
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const addRef = useRef(null);

  useEffect(() => {
    if (isAdding && addRef.current) {
      addRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isAdding]);

  const doFlash = (id, type) => {
    setFlash({ id, type });
    setTimeout(() => setFlash(null), 1200);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    const vals = {};
    columns.forEach((c) => {
      vals[c.key] = row[c.key] ?? "";
    });
    setEditRow(vals);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow({});
  };

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

  const renderCell = (col, value, onChange) => {
    const base =
      "bg-zinc-700/50 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500/60 w-full";
    if (col.type === "select") {
      return (
        <select className={base} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
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
    <div className="bg-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-100 hover:text-amber-400 transition-colors">
          <svg className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {title}
          <span className="text-xs text-zinc-500 font-normal">({data.length})</span>
        </button>
        <div className="flex items-center gap-2">
          {exportEntity && (
            <div className="relative group">
              <button className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500 transition-colors">
                Export ↓
              </button>
              <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <a href={`/api/export/${exportEntity}?format=csv`}
                  className="block px-4 py-2 text-xs text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 whitespace-nowrap"
                  download>CSV</a>
                <a href={`/api/export/${exportEntity}?format=xlsx`}
                  className="block px-4 py-2 text-xs text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 whitespace-nowrap"
                  download>Excel</a>
              </div>
            </div>
          )}
          {!isAdding && (
            <button onClick={startAdd}
              className="text-xs bg-amber-600/80 hover:bg-amber-600 text-white px-3 py-1 rounded transition-colors">
              + Add
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700">
                {columns.map((c) => (
                  <th key={c.key}
                    className="px-3 py-2 text-left text-zinc-500 font-medium"
                    style={c.width ? { width: c.width } : {}}>
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {/* New row form */}
              {isAdding && (
                <tr ref={addRef} className={`border-b border-amber-600/30 bg-amber-950/20 ${flashClass("new")}`}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      {renderCell(c, newRow[c.key], (v) => setNewRow({ ...newRow, [c.key]: v }))}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={saveNew} disabled={saving}
                        className="text-green-400 hover:text-green-300 disabled:opacity-40" title="Save">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button onClick={() => setIsAdding(false)}
                        className="text-red-400 hover:text-red-300" title="Cancel">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {data.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id}
                    className={`border-b border-zinc-700/50 hover:bg-zinc-700/20 transition-colors ${flashClass(row.id)}`}>
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2">
                        {isEditing && c.editable !== false ? (
                          renderCell(c, editRow[c.key], (v) => setEditRow({ ...editRow, [c.key]: v }))
                        ) : (
                          <span className={`${c.type === "number" ? "font-mono text-right block" : ""} text-zinc-300`}>
                            {c.type === "number" ? fmt(row[c.key]) : (row[c.key] ?? "—")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={saveEdit} disabled={saving}
                            className="text-green-400 hover:text-green-300 disabled:opacity-40" title="Save">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button onClick={cancelEdit}
                            className="text-red-400 hover:text-red-300" title="Cancel">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : deleteConfirm === row.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => confirmDelete(row.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 font-semibold">Delete?</button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300">No</button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button onClick={() => startEdit(row)}
                            className="text-zinc-600 hover:text-amber-400 transition-colors" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => setDeleteConfirm(row.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors" title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {data.length === 0 && !isAdding && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-zinc-600 text-sm">
                    No data yet. Click <span className="text-amber-500">+ Add</span> to get started.
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
