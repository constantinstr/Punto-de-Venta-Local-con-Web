"use client";

import { useState } from "react";
import type { AssignableRole, StaffUser } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useUsersList, useCreateUser, useUpdateUser } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  MANAGER: "Encargado",
  CASHIER: "Cajero",
};

const ASSIGNABLE_ROLES: AssignableRole[] = ["ADMIN", "MANAGER", "CASHIER"];

export default function UsersSettingsPage() {
  const user = useRequireAuth();
  const { data: users, isLoading } = useUsersList();
  const createUser = useCreateUser();

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("CASHIER");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const isOwner = user.role === "OWNER";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser.mutateAsync({ email, fullName, password, role });
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("CASHIER");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Empleados</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {showCreate ? "Cerrar" : "+ Nuevo empleado"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Nombre completo
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
              />
            </label>
            <label className="text-xs text-muted">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
              />
            </label>
            <label className="text-xs text-muted">
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
              />
            </label>
            <label className="text-xs text-muted">
              Rol
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
                className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
              >
                {ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" || isOwner).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={createUser.isPending}
            className="rounded bg-green-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Crear empleado
          </button>
        </form>
      )}

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Rol</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <UserRow key={u.id} staffUser={u} currentUserId={user.id} isOwner={isOwner} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  staffUser,
  currentUserId,
  isOwner,
}: {
  staffUser: StaffUser;
  currentUserId: string;
  isOwner: boolean;
}) {
  const updateUser = useUpdateUser();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<AssignableRole>(
    staffUser.role === "OWNER" ? "ADMIN" : (staffUser.role as AssignableRole),
  );
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSelf = staffUser.id === currentUserId;
  const isTargetOwner = staffUser.role === "OWNER";
  // Un ADMIN no editable por otro ADMIN — solo el OWNER puede.
  const canEdit = !isTargetOwner && !isSelf && (isOwner || staffUser.role !== "ADMIN");

  async function handleSave() {
    setError(null);
    try {
      await updateUser.mutateAsync({
        id: staffUser.id,
        input: { role, newPassword: newPassword.trim() || undefined },
      });
      setEditing(false);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function handleToggleActive() {
    setError(null);
    try {
      await updateUser.mutateAsync({ id: staffUser.id, input: { isActive: !staffUser.isActive } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    }
  }

  return (
    <>
      <tr className="border-b border-border">
        <td className="py-2 pr-3">{staffUser.fullName}</td>
        <td className="py-2 pr-3 text-xs text-muted">{staffUser.email}</td>
        <td className="py-2 pr-3">
          {editing ? (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            >
              {(["ADMIN", "MANAGER", "CASHIER"] as AssignableRole[])
                .filter((r) => r !== "ADMIN" || isOwner)
                .map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
            </select>
          ) : (
            ROLE_LABELS[staffUser.role] ?? staffUser.role
          )}
        </td>
        <td className="py-2 pr-3 text-xs">
          <span className={staffUser.isActive ? "text-green-600" : "text-red-600"}>
            {staffUser.isActive ? "Activo" : "Inactivo"}
          </span>
        </td>
        <td className="py-2 text-right text-xs">
          {canEdit &&
            (editing ? (
              <>
                <button onClick={() => void handleSave()} className="mr-2 underline">
                  Guardar
                </button>
                <button onClick={() => setEditing(false)} className="underline">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="mr-2 underline">
                  Editar
                </button>
                <button onClick={() => void handleToggleActive()} className="underline">
                  {staffUser.isActive ? "Desactivar" : "Activar"}
                </button>
              </>
            ))}
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-border">
          <td colSpan={5} className="py-2">
            <label className="text-xs text-muted">
              Nueva contraseña (opcional)
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                placeholder="Dejar vacío para no cambiarla"
                className="mt-0.5 block w-56 rounded border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
