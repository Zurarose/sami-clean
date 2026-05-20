"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  label: string;
};

type Place = { id: string; name: string };

type Assignment = {
  id: string;
  date: string;
  reminded: boolean;
  user: User;
  place: Place;
};

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const selectClassName =
  "select-field w-full rounded-lg border border-input bg-card pl-3 py-2 text-card-foreground";

export default function Dashboard() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [userId, setUserId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [year, mon] = month.split("-").map(Number);
  const totalDays = daysInMonth(year, mon);
  const firstWeekday = new Date(year, mon - 1, 1).getDay();

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [u, p, a] = await Promise.all([
          fetch("/api/users").then((r) => r.json()),
          fetch("/api/places").then((r) => r.json()),
          fetch(`/api/assignments?month=${month}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setUsers(u);
        setPlaces(p);
        setAssignments(a);
        setError(null);
      } catch {
        if (!cancelled) setError("Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  }, [assignments]);

  const selectedAssignments = selectedDate
    ? (byDate.get(selectedDate) ?? [])
    : [];

  async function addPlace() {
    const name = newPlace.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add place");
      setPlaces((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setPlaceId(data.id);
      setNewPlace("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add place");
    } finally {
      setSaving(false);
    }
  }

  async function removePlace(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/places?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete place");
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setAssignments((prev) => prev.filter((a) => a.place.id !== id));
      if (placeId === id) setPlaceId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete place");
    } finally {
      setSaving(false);
    }
  }

  async function addAssignment() {
    if (!selectedDate || !userId || !placeId) {
      setError("Pick a day, person, and place");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          userId,
          placeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setAssignments((prev) => [...prev, data]);
      setUserId("");
      setPlaceId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, mon - 1 + delta, 1);
    setLoading(true);
    setMonth(monthKey(d));
    setSelectedDate(null);
  }

  const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const todayKey = toDateKey(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate(),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4">
        <Image
          src="/logo.svg"
          alt="Sami Clean"
          width={200}
          height={54}
          priority
        />
        <p className="text-muted-foreground">
          Assign who cleans which place. Telegram reminders go out one day before.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-accent"
          >
            ←
          </button>
          <h2 className="text-lg font-medium">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-accent"
          >
            →
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const dateKey = toDateKey(year, mon, day);
            const dayAssignments = byDate.get(dateKey) ?? [];
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === todayKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                className={`flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-transparent hover:border-border hover:bg-muted"
                } ${isToday && !isSelected ? "ring-1 ring-ring" : ""}`}
              >
                <span className="w-full text-center font-medium">{day}</span>
                {dayAssignments.length > 0 && (
                  <span
                    className={`mt-0.5 w-full truncate text-center text-[10px] ${
                      isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {dayAssignments.length} job{dayAssignments.length > 1 ? "s" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading && (
          <p className="mt-3 text-center text-sm text-muted-foreground">Loading…</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="mb-4 text-lg font-medium">
            {selectedDate
              ? `Assign — ${new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}`
              : "Select a day on the calendar"}
          </h3>

          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No users yet. Members should run <code className="text-xs">/start</code> in the
              bot or join the Telegram group.
            </p>
          ) : (
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-muted-foreground">Person</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={!selectedDate || saving}
                className={selectClassName}
              >
                <option value="">Choose…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                    {u.username ? ` (@${u.username})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">Place</span>
            <select
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              disabled={!selectedDate || saving}
              className={selectClassName}
            >
              <option value="">Choose…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={newPlace}
              onChange={(e) => setNewPlace(e.target.value)}
              placeholder="New place name"
              className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground"
            />
            <button
              type="button"
              onClick={addPlace}
              disabled={saving || !newPlace.trim()}
              className="shrink-0 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {places.length > 0 && (
            <ul className="mb-4 flex flex-col gap-1.5">
              {places.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>{p.name}</span>
                  <button
                    type="button"
                    onClick={() => removePlace(p.id)}
                    disabled={saving}
                    className="text-destructive hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addAssignment}
            disabled={!selectedDate || saving || !userId || !placeId}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Save assignment
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="mb-4 text-lg font-medium">Day schedule</h3>
          {!selectedDate ? (
            <p className="text-sm text-muted-foreground">Click a calendar day to see assignments.</p>
          ) : selectedAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments for this day.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedAssignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/40 px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{a.user.label}</p>
                    <p className="text-sm text-muted-foreground">{a.place.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.reminded && (
                      <span className="text-xs text-chart-5">
                        reminded
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAssignment(a.id)}
                      disabled={saving}
                      className="text-sm text-destructive hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}