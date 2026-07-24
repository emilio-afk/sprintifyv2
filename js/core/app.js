// app.js - VERSIÓN COMPLETA ACTUALIZADA

import {
  db,
  getRtdb,
  listsCollection,
  tasksCollection,
  epicsCollection,
  themesCollection,
  profilesCollection,
  handbookCollection,
  programsCollection,
} from "./firebase.js";
import { handleAuth, login, logout, getCalendarAccessToken } from "../integrations/auth.js";
import * as ui from "../ui/ui.js";
import {
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  getDocs,
  Timestamp,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref,
  onValue,
  set,
  onDisconnect,
  serverTimestamp as rtdbServerTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import * as calendar from "../integrations/calendar.js";
import { computeItemFlag } from "./flags.js";
import { weeklySnapshotsCollection } from "./firebase.js";

// Resumen legible del valor de un ítem según su tipo (para el corte semanal).
function itemValueSummary(item) {
  if (item.measurementType === "hito") {
    return { pending: "Pendiente", inprogress: "En curso", done: "Hecho" }[item.status] || "—";
  }
  if (item.measurementType === "tasa") {
    return `${item.real ?? "—"} / ${item.meta ?? "—"}`;
  }
  if (item.measurementType === "apuesta") {
    return { advanced: "Avanzó", stalled: "Se estancó", died: "Murió" }[item.betStatus] || "—";
  }
  return "";
}

// Lunes de la semana que contiene `date`, como "YYYY-MM-DD".
function getWeekOf(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ------------------ Estado global ------------------
const state = {
  user: null,
  tasks: [],
  taskLists: [],
  epics: [],
  themes: [],
  programs: [], // Tablero Astrolab: capa superior (período u objetivo)
  weeklySnapshots: [], // Cortes semanales ("estado del lunes")
  boardCollapsedFrentes: new Set(), // Frentes colapsados en la vista Tablero
  allUsers: [],
  onlineUsers: [],
  backlogId: null,
  currentSprintId: null,
  unsubscribe: [],
  timelineDate: new Date(),
  timelineZoom: null,
  draggedTaskId: null,
  sprintifyCalendarId: null,
  googleAccessToken: null,
  calendarStatus: "disconnected",
  isInitialLoadComplete: false,

  // --- NUEVOS ESTADOS PARA VISTA POR PERSONA ---
  expandedPersonViews: new Set(), // Controla qué carriles están abiertos
  personViewPersonFilter: "all", // Filtro de persona ('all' o email)
  personViewSprintFilter: "all",
  personViewSearch: "",
  personViewSortMode: "load_desc",
  personViewQuickFilter: "all",
  personViewMode: "current",
  personViewOpenPanel: null,
  personViewDensity: "comfortable",
  hasInitializedPersonViews: false, // Para evitar resetear la vista en cada update
  collapsedColumns: new Set(), // Almacena los IDs ('todo', 'inprogress', 'done')
  expandedEpicIds: new Set(),
  taskCardDensity: "comfortable", // "comfortable" | "compact"
  sprintBreakdownOpen: false,
  kanbanAssigneeFilter: null, // null = todos, email = filtro activo
  collapsedBacklogEpics: new Set(), // Épicas colapsadas en vista backlog
  handbookEntries: [],
  triageConfig: null,
  sprintsSummaryFilter: "active",
  activityFilter: "unread",
  epicsSearch: "",
  epicsStatusFilter: "",
  epicsSortMode: "recent",
};

// ------------------ Render throttle ------------------
let renderRequest = null;
function requestRender() {
  if (renderRequest) cancelAnimationFrame(renderRequest);
  renderRequest = requestAnimationFrame(() => {
    if (state.isInitialLoadComplete) {
      ui.handleRouteChange(state);
      ui.renderSprintSelector(state);
      ui.renderCalendarButton(state);
      ui.renderOnlineUsers(state.onlineUsers);
      ui.renderActiveSprintTitle(state);
      ui.updateSprintCapacityInput(state);
      checkUnreadActivity();
    } else if (state.user) {
      ui.renderLoadingSkeletons(state);
    }
  });
}

// ------------------ Pequeños helpers ------------------
const getTaskById = (id) => state.tasks.find((t) => t.id === id);
const assertUserOr = (fallback) => (state.user ? true : (fallback?.(), false));
const normalizeTimelineDate = (date, zoomMode) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (zoomMode === "week") {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    d.setDate(diff);
  } else if (zoomMode === "quarter") {
    const startMonth = Math.floor(d.getMonth() / 3) * 3;
    d.setMonth(startMonth, 1);
  } else if (zoomMode === "year") {
    d.setMonth(0, 1);
  } else {
    d.setDate(1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
};

// ------------------ Acciones ------------------
const actions = {
  // --- NUEVAS ACCIONES PARA VISTA POR PERSONA ---
  setPersonViewPersonFilter(email) {
    state.personViewPersonFilter = email;
    requestRender();
  },

  // ¡ESTA ERA LA QUE FALTABA Y CAUSABA EL ERROR ROJO!
  setPersonViewSprintFilter(filter) {
    state.personViewSprintFilter = filter;
    requestRender();
  },

  setPersonViewSearch(value) {
    state.personViewSearch = typeof value === "string" ? value : "";
    requestRender();
  },

  setPersonViewSortMode(value) {
    const allowed = new Set(["load_desc", "risk_desc", "done_desc", "name_asc"]);
    state.personViewSortMode = allowed.has(value) ? value : "load_desc";
    requestRender();
  },

  setPersonViewQuickFilter(value) {
    const allowed = new Set(["all", "overloaded", "no_progress", "unassigned", "live_load"]);
    state.personViewQuickFilter = allowed.has(value) ? value : "all";
    requestRender();
  },

  setPersonViewMode(value) {
    const allowed = new Set(["current", "history"]);
    state.personViewMode = allowed.has(value) ? value : "current";
    requestRender();
  },

  togglePersonViewPanel(value) {
    const allowed = new Set(["filters"]);
    if (!allowed.has(value)) {
      state.personViewOpenPanel = null;
    } else {
      state.personViewOpenPanel = state.personViewOpenPanel === value ? null : value;
    }
    requestRender();
  },

  setPersonViewDensity(value) {
    const allowed = new Set(["comfortable", "compact"]);
    state.personViewDensity = allowed.has(value) ? value : "comfortable";
    requestRender();
  },

  setTaskCardDensity(value) {
    const allowed = new Set(["comfortable", "compact"]);
    state.taskCardDensity = allowed.has(value) ? value : "comfortable";
    requestRender();
  },

  toggleSprintBreakdown() {
    state.sprintBreakdownOpen = !state.sprintBreakdownOpen;
    requestRender();
  },

  setKanbanAssigneeFilter(email) {
    if (!email) {
      state.kanbanAssigneeFilter = null;
    } else {
      state.kanbanAssigneeFilter = state.kanbanAssigneeFilter === email ? null : email;
    }
    requestRender();
  },

  resetPersonViewControls() {
    state.personViewPersonFilter = "all";
    state.personViewSearch = "";
    state.personViewSortMode = "load_desc";
    state.personViewQuickFilter = "all";
    state.personViewOpenPanel = null;
    requestRender();
  },

  clearPersonViewAdvancedFilters() {
    state.personViewSortMode = "load_desc";
    state.personViewQuickFilter = "all";
    requestRender();
  },

  togglePersonView(email) {
    if (state.expandedPersonViews.has(email)) {
      state.expandedPersonViews.delete(email);
    } else {
      state.expandedPersonViews.add(email);
    }
    // State is updated silently — the DOM toggle in the click handler already
    // handles the visual expand/collapse without a full re-render.
  },

  toggleColumnCollapse(columnId) {
    if (state.collapsedColumns.has(columnId)) {
      state.collapsedColumns.delete(columnId);
    } else {
      state.collapsedColumns.add(columnId);
    }
    requestRender();
  },

  toggleBoardFrente(frenteId) {
    if (state.boardCollapsedFrentes.has(frenteId)) {
      state.boardCollapsedFrentes.delete(frenteId);
    } else {
      state.boardCollapsedFrentes.add(frenteId);
    }
    requestRender();
  },

  toggleBacklogEpic(epicId) {
    if (state.collapsedBacklogEpics.has(epicId)) {
      state.collapsedBacklogEpics.delete(epicId);
    } else {
      state.collapsedBacklogEpics.add(epicId);
    }
    requestRender();
  },

  setEpicsSearch(value) {
    state.epicsSearch = value;
    requestRender();
  },

  setEpicsStatusFilter(value) {
    state.epicsStatusFilter = value;
    requestRender();
  },

  setEpicsSortMode(value) {
    state.epicsSortMode = value;
    requestRender();
  },

  expandAllPersonViews() {
    if (state.allUsers.length > 0) {
      state.allUsers.forEach((u) => state.expandedPersonViews.add(u.email));
      state.expandedPersonViews.add("unassigned");
    }
  },
  // ----------------------------------------------

  // ---- Tareas / Comentarios / Epics / Sprints ----
  async addNewTask(title, listId, options = {}) {
    // <--- Añadir param options
    if (
      !assertUserOr(() =>
        ui.showModal({
          title: "Sesión requerida",
          text: "Inicia sesión para crear tareas.",
        })
      )
    )
      return;
    const cleanTitle = (title ?? "").trim();
    if (!cleanTitle || !listId) return;

    const payload = {
      title: cleanTitle,
      listId,
      status: "needsAction",
      kanbanStatus: "todo",
      createdAt: serverTimestamp(),
      lastMovedAt: serverTimestamp(),
      createdBy: state.user.email,
      assignee: options.assignee || null, // <--- Usar el assignee si viene
    };
    if (listId === state.backlogId) payload.order = Date.now();

    try {
      await addDoc(tasksCollection, payload);
    } catch (e) {
      console.error("addNewTask:", e);
    }
  },
  setSprintsSummaryFilter: (filter) => {
    state.sprintsSummaryFilter = filter;
    requestRender();
  },
  setActivityFilter: (filter) => {
    state.activityFilter = filter;
    requestRender();
  },
  async updateTask(taskId, updates) {
    if (!taskId || !updates) return;
    const patch = { ...updates };
    if (updates.history?.__op === "arrayUnion") {
      patch.history = arrayUnion(updates.history.value);
    }
    try {
      await updateDoc(doc(tasksCollection, taskId), patch);
    } catch (e) {
      console.error("updateTask:", e);
    }
  },

  deleteTask(taskId) {
    const t = getTaskById(taskId);
    if (!t) return;
    if (t.createdBy && t.createdBy !== state.user?.email) {
      return ui.showModal({
        title: "Acción no permitida",
        text: "Solo el creador puede borrarla.",
        okText: "Entendido",
      });
    }
    ui.showModal({
      title: "Confirmar Eliminación",
      text: "¿Estás seguro?",
      okText: "Borrar",
      okClass: "bg-red-600",
      callback: async (ok) => ok && deleteDoc(doc(tasksCollection, taskId)).catch(console.error),
    });
  },
  returnTaskToBacklog(taskId) {
    if (!taskId || !state.backlogId) return;

    const updates = {
      listId: state.backlogId,
      kanbanStatus: "todo",
      lastMovedAt: Timestamp.now(),
      history: arrayUnion({
        action: "Regresado al Backlog",
        user: state.user.displayName,
        timestamp: Timestamp.now(),
      }),
    };
    actions.updateTask(taskId, updates);
  },

  async moveTasksToSprint(taskIds, sprintId) {
    if (!sprintId || !Array.isArray(taskIds) || taskIds.length === 0) return;
    const batch = writeBatch(db);
    taskIds.forEach(
      (id) =>
        id &&
        batch.update(doc(tasksCollection, id), {
          listId: sprintId,
          lastMovedAt: serverTimestamp(),
        })
    );
    try {
      await batch.commit();
    } catch (e) {
      console.error("moveTasksToSprint:", e);
    }
  },

  assignEpicToTask(taskId, epicId) {
    return actions.updateTask(taskId, { epicId: epicId || null });
  },

  async postComment(taskId, text) {
    const content = (text ?? "").trim();
    if (!taskId || !content || !state.user) return;
    const comment = {
      text: content,
      author: state.user.displayName,
      authorEmail: state.user.email,
      timestamp: Timestamp.now(),
      edited: false,
      readBy: [],
    };
    try {
      await updateDoc(doc(tasksCollection, taskId), {
        comments: arrayUnion(comment),
      });
    } catch (e) {
      console.error("postComment:", e);
    }
  },

  async handleCommentAction(action, taskId, commentIndex) {
    const task = getTaskById(taskId);
    if (!task || !Array.isArray(task.comments)) return;
    if (commentIndex < 0 || commentIndex >= task.comments.length) return;
    const comment = task.comments[commentIndex];

    if (action === "delete-comment") {
      if (confirm("¿Estás seguro de borrar este comentario?")) {
        try {
          await updateDoc(doc(tasksCollection, taskId), {
            comments: arrayRemove(comment),
          });
        } catch (e) {
          console.error("delete-comment:", e);
        }
      }
      return;
    }

    if (action === "edit-comment") {
      return ui.showModal({
        title: "Editar comentario",
        input: true,
        inputValue: (comment.text || "").trim(),
        okText: "Guardar",
        isDialog: true,
        callback: async (input) => {
          const newText = (input ?? "").trim();
          if (!newText || newText === comment.text) return;
          const updated = [...task.comments];
          updated[commentIndex] = {
            ...comment,
            text: newText,
            edited: true,
            editedAt: Timestamp.now(),
          };
          try {
            await updateDoc(doc(tasksCollection, taskId), {
              comments: updated,
            });
          } catch (e) {
            console.error("edit-comment:", e);
          }
        },
      });
    }

    if (action === "toggle-read") {
      const me = state.user?.email;
      if (!me) return;
      const readBy = Array.isArray(comment.readBy) ? [...comment.readBy] : [];
      const isRead = readBy.includes(me);
      const nextReadBy = isRead ? readBy.filter((x) => x !== me) : [...readBy, me];
      const updated = [...task.comments];
      updated[commentIndex] = { ...comment, readBy: nextReadBy };
      try {
        await updateDoc(doc(tasksCollection, taskId), { comments: updated });
      } catch (e) {
        console.error("toggle-read:", e);
      }
    }
  },

  addNewSprint(result) {
    const { title, sequence, start, end, capacity = 0, color, epicId } = result || {};
    const parsedCapacity = Number(capacity);
    const normalizedCapacity =
      Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 40;

    if (!title || !start || !end) return ui.showModal({ title: "Error", text: "Faltan datos." });

    addDoc(listsCollection, {
      title,
      sequence: Number(sequence) || 0,
      startDate: Timestamp.fromDate(new Date(`${start}T00:00:00`)),
      endDate: Timestamp.fromDate(new Date(`${end}T00:00:00`)),
      isBacklog: false,
      capacity: normalizedCapacity,
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
      color,
      epicId: epicId || null,
      epicIds: epicId ? [epicId] : [],
    }).catch((e) => console.error("addNewSprint:", e));
  },

  updateSprint(sprintId, result) {
    const { title, sequence, start, end, capacity = 0, color, epicId } = result || {};
    const parsedCapacity = Number(capacity);
    const normalizedCapacity =
      Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 40;

    const updates = {
      title,
      startDate: Timestamp.fromDate(new Date(`${start}T00:00:00`)),
      endDate: Timestamp.fromDate(new Date(`${end}T00:00:00`)),
      capacity: normalizedCapacity,
      color,
      epicId: epicId || null,
    };

    if (epicId) {
      updates.epicIds = [epicId];
    }
    if (sequence !== undefined) {
      updates.sequence = Number(sequence);
    }

    updateDoc(doc(listsCollection, sprintId), updates).catch((e) =>
      console.error("updateSprint:", e)
    );
  },

  updateSprintCapacity(sprintId, newCapacity) {
    const cap = Number(newCapacity);
    if (!sprintId || Number.isNaN(cap)) return;
    updateDoc(doc(listsCollection, sprintId), { capacity: cap }).catch(console.error);
  },

  deleteSprint(sprintId) {
    const sprint = state.taskLists.find((l) => l.id === sprintId);
    if (!sprint || sprint.isBacklog)
      return ui.showModal({
        title: "Error",
        text: "No se puede borrar el backlog.",
      });
    if (sprint.createdBy && sprint.createdBy !== state.user?.email) {
      return ui.showModal({
        title: "Acción no permitida",
        text: "Solo el creador del sprint puede borrarlo.",
      });
    }

    ui.showModal({
      title: "Confirmar Borrado",
      text: `¿Borrar sprint "${sprint.title}" y TODAS sus tareas?`,
      okText: "Sí, Borrar Todo",
      okClass: "bg-red-600",
      callback: async (ok) => {
        if (!ok) return;
        try {
          const b = writeBatch(db);
          const q = query(tasksCollection, where("listId", "==", sprintId));
          const s = await getDocs(q);
          s.forEach((d) => b.delete(d.ref));
          b.delete(doc(listsCollection, sprintId));
          await b.commit();
        } catch (e) {
          console.error("deleteSprint:", e);
        }
      },
    });
  },
  archiveSprint(sprintId) {
    const sprint = state.taskLists.find((l) => l.id === sprintId);
    if (!sprint || !state.backlogId) return;

    ui.showModal({
      title: "Archivar Sprint",
      text: `¿Estás seguro de que quieres archivar "${sprint.title}"? Las tareas no completadas regresarán al Backlog.`,
      okText: "Sí, Archivar",
      callback: async (confirmed) => {
        if (!confirmed) return;

        try {
          const tasksQuery = query(tasksCollection, where("listId", "==", sprintId));
          const tasksSnapshot = await getDocs(tasksQuery);

          const batch = writeBatch(db);

          tasksSnapshot.forEach((taskDoc) => {
            const taskData = taskDoc.data();
            if (taskData.kanbanStatus !== "done") {
              batch.update(taskDoc.ref, { listId: state.backlogId });
            }
          });

          const sprintRef = doc(listsCollection, sprintId);
          batch.update(sprintRef, {
            isArchived: true,
            archivedAt: Timestamp.now(),
          });

          await batch.commit();

          if (sprintId === state.currentSprintId) {
            const availableSprints = state.taskLists.filter(
              (l) => !l.isBacklog && !l.isArchived && l.id !== sprintId
            );
            state.currentSprintId = availableSprints.length > 0 ? availableSprints[0].id : null;
            requestRender();
          }
        } catch (e) {
          console.error("Error al archivar el sprint:", e);
          ui.showModal({
            title: "Error",
            text: "No se pudo archivar el sprint.",
          });
        }
      },
    });
  },
  unarchiveSprint(sprintId, newEndDate) {
    if (!sprintId || !newEndDate) {
      return ui.showModal({
        title: "Error",
        text: "Se requiere una nueva fecha de fin para restaurar el sprint.",
      });
    }

    const updates = {
      isArchived: false,
      archivedAt: null,
      endDate: Timestamp.fromDate(new Date(`${newEndDate}T00:00:00`)),
    };

    updateDoc(doc(listsCollection, sprintId), updates).catch((e) =>
      console.error("Error al restaurar sprint:", e)
    );
  },
  addNewEpic(result) {
    const title = (result?.title ?? "").trim();
    if (!title)
      return ui.showModal({
        title: "Error de Validación",
        text: "El nombre del Epic no puede estar vacío.",
      });

    addDoc(epicsCollection, {
      title,
      description: result.description ?? "",
      status: result.status ?? "Por Empezar",
      color: result.color || "#475569",
      themeId: result.themeId || null,
      startDate: result.startDate
        ? Timestamp.fromDate(new Date(`${result.startDate}T00:00:00`))
        : serverTimestamp(),
      endDate: result.endDate ? Timestamp.fromDate(new Date(`${result.endDate}T00:00:00`)) : null,
      keyResults: result.keyResults || [],
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addNewEpic:", e));
  },

  updateEpic(epicId, result) {
    if (!epicId || !result?.title) return;
    updateDoc(doc(epicsCollection, epicId), { ...result }).catch(console.error);
  },

  deleteEpic(epicId) {
    const epic = state.epics.find((p) => p.id === epicId);
    if (!epic) return;
    ui.showModal({
      title: "Confirmar Eliminación",
      text: `¿Borrar epic "${epic.title}"?`,
      okText: "Sí, Borrar",
      okClass: "bg-red-600",
      callback: async (ok) => {
        if (!ok) return;
        try {
          const b = writeBatch(db);
          const q = query(listsCollection, where("epicIds", "array-contains", epicId));
          const s = await getDocs(q);
          s.forEach((d) => b.update(d.ref, { epicIds: arrayRemove(epicId) }));
          b.delete(doc(epicsCollection, epicId));
          await b.commit();
        } catch (e) {
          console.error("deleteEpic:", e);
        }
      },
    });
  },
  addNewTheme(result) {
    const title = (result?.title ?? "").trim();
    if (!title)
      return ui.showModal({
        title: "Error",
        text: "El título es obligatorio.",
      });

    addDoc(themesCollection, {
      title,
      description: result.description ?? "",
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addNewTheme:", e));
  },

  updateTheme(themeId, result) {
    const title = (result?.title ?? "").trim();
    if (!themeId || !title) return;
    updateDoc(doc(themesCollection, themeId), {
      title,
      description: result.description ?? "",
    }).catch(console.error);
  },

  deleteTheme(themeId) {
    const theme = state.themes.find((t) => t.id === themeId);
    if (!theme) return;
    ui.showModal({
      title: "Confirmar Eliminación",
      text: `¿Borrar el Tema "${theme.title}"? Los Epics asociados no se borrarán, solo se desvincularán.`,
      okText: "Sí, Borrar",
      okClass: "bg-red-600",
      callback: async (ok) => {
        if (!ok) return;
        try {
          const b = writeBatch(db);
          const q = query(epicsCollection, where("themeId", "==", themeId));
          const s = await getDocs(q);
          s.forEach((d) => b.update(d.ref, { themeId: null }));
          b.delete(doc(themesCollection, themeId));
          await b.commit();
        } catch (e) {
          console.error("deleteTheme:", e);
        }
      },
    });
  },
  async updateBacklogOrder(taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) return;
    const batch = writeBatch(db);
    taskIds.forEach((id, idx) => id && batch.update(doc(tasksCollection, id), { order: idx }));
    try {
      await batch.commit();
    } catch (e) {
      console.error("updateBacklogOrder:", e);
    }
  },

  updateTriageScore(taskId) {
    if (!state.triageConfig) return console.error("Triage config no cargada.");
    const impactChecks = document.querySelectorAll("#triage-impact-questions input:checked");
    const effortChecks = document.querySelectorAll("#triage-effort-questions input:checked");

    const impactSel = Array.from(impactChecks).map((cb) => cb.dataset.id);
    const effortSel = Array.from(effortChecks).map((cb) => cb.dataset.id);

    const sumBy = (arr, bank) =>
      arr.reduce((acc, id) => acc + (bank.find((q) => q.id === id)?.weight ?? 0), 0);

    const impact = sumBy(impactSel, state.triageConfig.impact || []);
    const effort = sumBy(effortSel, state.triageConfig.effort || []);

    actions.updateTask(taskId, {
      impact,
      effort,
      triageImpactSelections: impactSel,
      triageEffortSelections: effortSel,
    });
  },

  setDraggedTaskId: (id) => {
    state.draggedTaskId = id;
  },
  setTimelineZoom: (zoom) => {
    state.timelineZoom = zoom;
    state.timelineDate = normalizeTimelineDate(state.timelineDate, zoom);
    requestRender();
  },
  setTimelineDate: (inc) => {
    const storedZoom =
      (typeof localStorage !== "undefined" && localStorage.getItem("timelineZoom")) || null;
    const zoomMode = state.timelineZoom || storedZoom || "month";
    const baseDate = normalizeTimelineDate(state.timelineDate, zoomMode);
    const nextDate = new Date(baseDate);

    if (zoomMode === "week") {
      nextDate.setDate(nextDate.getDate() + inc * 7);
    } else if (zoomMode === "quarter") {
      nextDate.setMonth(nextDate.getMonth() + inc * 3);
    } else if (zoomMode === "year") {
      nextDate.setFullYear(nextDate.getFullYear() + inc);
    } else {
      nextDate.setMonth(nextDate.getMonth() + inc);
    }

    state.timelineDate = normalizeTimelineDate(nextDate, zoomMode);
    requestRender();
  },
  setCurrentSprintId: (id) => {
    state.currentSprintId = id;
    requestRender();
  },
  handleRouteChange: () => {
    requestRender();
  },
  toggleEpicDetails: (id) => {
    state.expandedEpicIds.has(id)
      ? state.expandedEpicIds.delete(id)
      : state.expandedEpicIds.add(id);
    // State updated silently — DOM toggle handled directly in handleEpicCardAction.
  },

  // ---- Calendar / Auth ----
  async connectCalendar() {
    state.calendarStatus = "connecting";
    requestRender();
    try {
      const token = await getCalendarAccessToken();
      const calendarId = await calendar.findOrCreateSprintifyCalendar(token);
      state.googleAccessToken = token;
      state.sprintifyCalendarId = calendarId;
      state.calendarStatus = "connected";
      ui.showModal({
        title: "¡Conectado!",
        text: "Se estableció la conexión con Google Calendar.",
        okText: "Genial",
      });
    } catch (error) {
      state.calendarStatus = "disconnected";
      ui.showModal({
        title: "Error de Conexión",
        text: error.message,
        okText: "Entendido",
      });
    } finally {
      requestRender();
    }
  },

  async executeCalendarAction(actionFn) {
    if (!state.googleAccessToken) throw new Error("Primero conecta Google Calendar.");
    try {
      return await actionFn(state.googleAccessToken);
    } catch (err) {
      if (err?.name === "TokenError") {
        const fresh = await getCalendarAccessToken();
        state.googleAccessToken = fresh;
        return await actionFn(fresh);
      }
      throw err;
    }
  },

  async syncTaskToCalendar(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;
    const act = async (token) => calendar.createTaskEvent(task, state.sprintifyCalendarId, token);
    try {
      ui.showModal({
        title: "Sincronizando...",
        text: "Creando evento...",
        okText: "",
      });
      const eventId = await actions.executeCalendarAction(act);
      if (eventId)
        await actions.updateTask(taskId, {
          googleEventId: eventId,
          googleCalendarId: state.sprintifyCalendarId,
        });
      ui.hideModal();
    } catch (e) {
      ui.showModal({ title: "Error", text: e.message, okText: "Cerrar" });
    }
  },

  async checkCalendarStatus(taskId) {
    const task = getTaskById(taskId);
    if (!task?.googleEventId) return;
    const act = async (token) =>
      calendar.getEventStatus(task.googleEventId, task.googleCalendarId, token);
    try {
      ui.showModal({
        title: "Verificando...",
        text: "Consultando Google Calendar...",
        okText: "",
      });
      const status = await actions.executeCalendarAction(act);
      if (status === "exists") {
        ui.showModal({
          title: "OK",
          text: "El evento existe en tu Google Calendar.",
          okText: "¡Genial!",
        });
      } else if (status === "not_found") {
        ui.showModal({
          title: "Evento no encontrado",
          text: "El evento fue eliminado. ¿Desvincular de la tarea?",
          okText: "Sí, desvincular",
          callback: (ok) =>
            ok &&
            actions.updateTask(taskId, {
              googleEventId: null,
              googleCalendarId: null,
            }),
        });
      } else {
        throw new Error("No se pudo verificar el estado del evento.");
      }
    } catch (e) {
      ui.showModal({ title: "Error", text: e.message, okText: "Cerrar" });
    }
  },

  markAllAsRead() {
    if (!state.user) return;
    const batch = writeBatch(db);
    const me = state.user.email;
    const mine = state.tasks.filter(
      (t) =>
        t.assignee === me &&
        t.comments?.some((c) => c.authorEmail !== me && !c.readBy?.includes(me))
    );
    mine.forEach((t) => {
      const updated = t.comments.map((c) =>
        c.authorEmail !== me && !c.readBy?.includes(me)
          ? { ...c, readBy: [...(c.readBy || []), me] }
          : c
      );
      batch.update(doc(tasksCollection, t.id), { comments: updated });
    });
    if (mine.length) batch.commit().catch((e) => console.error("markAllAsRead:", e));
  },

  async toggleEpicKr(epicId, krIndex) {
    if (!epicId || krIndex === undefined) return;
    const epic = state.epics.find((e) => e.id === epicId);
    if (!epic) return;

    const currentIndices = epic.completedKrIndices || [];
    const idx = Number(krIndex);
    let newIndices;

    if (currentIndices.includes(idx)) {
      newIndices = arrayRemove(idx);
    } else {
      newIndices = arrayUnion(idx);
    }

    try {
      await updateDoc(doc(epicsCollection, epicId), {
        completedKrIndices: newIndices,
      });
    } catch (e) {
      console.error("toggleEpicKr error:", e);
    }
  },
  login,
  logout,

  // ---- Handbook ----
  addHandbookEntry(data) {
    const title = data?.title?.trim();
    const content = data?.content;
    if (!title || !content)
      return ui.showModal({
        title: "Error",
        text: "Título y contenido son obligatorios.",
      });

    const plainContent = JSON.parse(JSON.stringify(content));

    addDoc(handbookCollection, {
      title,
      content: plainContent,
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch(console.error);
  },

  updateHandbookEntry(entryId, data) {
    const title = data?.title?.trim();
    const content = data?.content;
    if (!entryId || !title || !content)
      return ui.showModal({
        title: "Error",
        text: "Título y contenido son obligatorios.",
      });

    const plainContent = JSON.parse(JSON.stringify(content));

    updateDoc(doc(handbookCollection, entryId), {
      title,
      content: plainContent,
      updatedAt: serverTimestamp(),
      lastEditedBy: state.user?.email ?? null,
    }).catch(console.error);
  },

  deleteHandbookEntry(entryId) {
    if (!entryId) return;
    ui.showModal({
      title: "Confirmar Eliminación",
      text: "¿Borrar esta entrada del manual?",
      okText: "Sí, Borrar",
      okClass: "bg-red-600",
      callback: (ok) => ok && deleteDoc(doc(handbookCollection, entryId)).catch(console.error),
    });
  },

  // --- Tablero Astrolab: CRUD de estructura e ítems ---
  addBoardProgram(data) {
    const title = (data?.title ?? "").trim();
    if (!title) return;
    addDoc(programsCollection, {
      title,
      description: data.description ?? "",
      owner: data.owner ?? null,
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addBoardProgram:", e));
  },

  updateBoardProgram(programId, data) {
    if (!programId) return;
    updateDoc(doc(programsCollection, programId), {
      title: (data?.title ?? "").trim(),
      description: data.description ?? "",
      owner: data.owner ?? null,
    }).catch((e) => console.error("updateBoardProgram:", e));
  },

  deleteBoardProgram(programId) {
    const program = state.programs.find((p) => p.id === programId);
    if (!program) return;
    const frentes = state.epics.filter((e) => e.programId === programId);
    const frenteIds = new Set(frentes.map((f) => f.id));
    const items = state.tasks.filter((t) => frenteIds.has(t.epicId));
    ui.showModal({
      title: "Borrar programa",
      text: `¿Borrar "${program.title}" con sus ${frentes.length} frente(s) y ${items.length} ítem(s)? No se puede deshacer.`,
      okText: "Sí, borrar todo",
      okClass: "bg-red-600",
      callback: async (ok) => {
        if (!ok) return;
        try {
          const batch = writeBatch(db);
          items.forEach((t) => batch.delete(doc(tasksCollection, t.id)));
          frentes.forEach((f) => batch.delete(doc(epicsCollection, f.id)));
          batch.delete(doc(programsCollection, programId));
          await batch.commit();
        } catch (e) {
          console.error("deleteBoardProgram:", e);
        }
      },
    });
  },

  deleteBoardFrente(frenteId) {
    const frente = state.epics.find((e) => e.id === frenteId);
    if (!frente) return;
    const items = state.tasks.filter((t) => t.epicId === frenteId);
    ui.showModal({
      title: "Borrar frente",
      text: `¿Borrar "${frente.title}" con sus ${items.length} ítem(s)? No se puede deshacer.`,
      okText: "Sí, borrar",
      okClass: "bg-red-600",
      callback: async (ok) => {
        if (!ok) return;
        try {
          const batch = writeBatch(db);
          items.forEach((t) => batch.delete(doc(tasksCollection, t.id)));
          batch.delete(doc(epicsCollection, frenteId));
          await batch.commit();
        } catch (e) {
          console.error("deleteBoardFrente:", e);
        }
      },
    });
  },

  addBoardFrente(data) {
    const title = (data?.title ?? "").trim();
    if (!title || !data?.programId) return;
    addDoc(epicsCollection, {
      title,
      programId: data.programId,
      status: "En curso",
      color: "#475569",
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addBoardFrente:", e));
  },

  updateBoardFrente(frenteId, data) {
    const title = (data?.title ?? "").trim();
    if (!frenteId || !title) return;
    updateDoc(doc(epicsCollection, frenteId), {
      title,
      programId: data.programId || null,
    }).catch((e) => console.error("updateBoardFrente:", e));
  },

  addBoardItem(epicId, data) {
    if (!epicId || !data?.title) return;
    addDoc(tasksCollection, {
      epicId,
      title: data.title,
      measurementType: data.measurementType,
      ...actions._itemTypeFields(data),
      createdAt: serverTimestamp(),
      lastMovedAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addBoardItem:", e));
  },

  updateBoardItem(itemId, data) {
    if (!itemId || !data) return;
    const patch = {
      title: data.title,
      measurementType: data.measurementType,
      ...actions._itemTypeFields(data),
      lastMovedAt: serverTimestamp(),
    };
    if (data.epicId) patch.epicId = data.epicId; // mover de frente
    updateDoc(doc(tasksCollection, itemId), patch).catch((e) =>
      console.error("updateBoardItem:", e)
    );
  },

  // Normaliza los campos según el tipo (limpia los que no aplican).
  _itemTypeFields(data) {
    const toTs = (v) => (v ? Timestamp.fromDate(new Date(`${v}T00:00:00`)) : null);
    if (data.measurementType === "hito") {
      return {
        doneCriteria: data.doneCriteria ?? "",
        targetDate: toTs(data.targetDate),
        status: data.status ?? "pending",
      };
    }
    if (data.measurementType === "tasa") {
      return {
        meta: Number(data.meta) || 0,
        real: Number(data.real) || 0,
        period: data.period ?? "mes",
        qualityNote: data.qualityNote ?? "",
      };
    }
    if (data.measurementType === "apuesta") {
      return {
        hypothesis: data.hypothesis ?? "",
        progressSignal: data.progressSignal ?? "",
        weekTest: data.weekTest ?? "",
        betStatus: data.betStatus ?? "stalled",
        lastMovedAt: data.betStatus === "advanced" ? serverTimestamp() : null,
      };
    }
    return {};
  },

  // Actualización semanal ("estado del lunes") A NIVEL ÍTEM: actualiza la
  // medición del ítem + nota, y congela un corte por ítem para la semana.
  async saveWeeklyUpdate(itemId, data) {
    const item = state.tasks.find((t) => t.id === itemId);
    if (!item) return;
    const frente = state.epics.find((e) => e.id === item.epicId);
    const weekOf = getWeekOf(new Date());
    const note = (data?.note ?? "").trim();

    // Aplica la medición según el tipo (solo el campo que se captura cada semana).
    const patch = { note, lastWeeklyUpdate: serverTimestamp() };
    if (item.measurementType === "hito" && data.status !== undefined) {
      patch.status = data.status;
    } else if (item.measurementType === "tasa" && data.real !== undefined) {
      patch.real = Number(data.real) || 0;
    } else if (item.measurementType === "apuesta" && data.betStatus !== undefined) {
      patch.betStatus = data.betStatus;
      if (data.betStatus === "advanced") patch.lastMovedAt = serverTimestamp();
    }

    const merged = { ...item, ...patch };
    const flag = computeItemFlag(merged, new Date());

    try {
      await updateDoc(doc(tasksCollection, itemId), patch);
      await setDoc(doc(weeklySnapshotsCollection, `${weekOf}_${itemId}`), {
        weekOf,
        itemId,
        itemTitle: item.title || "",
        measurementType: item.measurementType || null,
        frenteId: item.epicId || null,
        frenteTitle: frente?.title || "",
        programId: frente?.programId || null,
        flag: { color: flag.color, reason: flag.reason },
        valueSummary: itemValueSummary(merged),
        note,
        createdAt: serverTimestamp(),
        createdBy: state.user?.email ?? null,
      });
    } catch (e) {
      console.error("saveWeeklyUpdate:", e);
      ui.showModal({ title: "Error", text: "No se pudo guardar la actualización.", okText: "Cerrar" });
    }
  },

  deleteBoardItem(itemId) {
    if (!itemId) return;
    ui.showModal({
      title: "Confirmar eliminación",
      text: "¿Borrar este ítem?",
      okText: "Sí, borrar",
      okClass: "bg-red-600",
      callback: (ok) => ok && deleteDoc(doc(tasksCollection, itemId)).catch(console.error),
    });
  },

  // --- Tablero Astrolab: sembrar ejemplo limpio (una vez) ---
  async seedBoardExample() {
    if (!assertUserOr(() => ui.showModal({ title: "Sesión requerida", text: "Inicia sesión." })))
      return;
    if (state.programs.length) {
      return ui.showModal({
        title: "Ya hay datos",
        text: "El tablero ya tiene contenido. El sembrado solo corre en un tablero vacío para no duplicar.",
        okText: "Entendido",
      });
    }

    const owner = state.user?.email ?? null;
    const d = (str) => Timestamp.fromDate(new Date(`${str}T00:00:00`));

    try {
      // Programas (bolsa de trabajo con dueño) — antes eran "carriles"
      const mkProgram = (title, ownerName, description) =>
        addDoc(programsCollection, {
          title,
          owner: ownerName,
          description: description || "",
          createdAt: serverTimestamp(),
          createdBy: owner,
        });
      const [blue, corp, ejec] = await Promise.all([
        mkProgram("Blue Hackers", "Ana Fer", "Construir el servicio y generar demanda"),
        mkProgram("Corporativo", "Andrés", "Construir la oferta y aterrizar cuentas"),
        mkProgram("Ejecución", "Socio director", "Proyectos a cliente ya vendidos"),
      ]);

      // Frentes (epics con programId) = fases dentro de la bolsa
      const mkFrente = (title, programId) =>
        addDoc(epicsCollection, {
          title,
          programId,
          status: "En curso",
          color: "#475569",
          createdAt: serverTimestamp(),
          createdBy: owner,
        });
      const [fServicio, fDemanda, fOferta, fCuentas, fIconn] = await Promise.all([
        mkFrente("Desarrollar el servicio", blue.id),
        mkFrente("Generar demanda (leads)", blue.id),
        mkFrente("Construir la oferta (AB System corp.)", corp.id),
        mkFrente("Aterrizar cuentas", corp.id),
        mkFrente("ICONN", ejec.id),
      ]);

      // Ítems (tasks con measurementType y campos por tipo)
      const mkItem = (epicId, data) =>
        addDoc(tasksCollection, {
          epicId,
          status: data.status ?? "needsAction",
          createdAt: serverTimestamp(),
          createdBy: owner,
          ...data,
        });

      await Promise.all([
        // 🎯 Hitos — Desarrollar el servicio
        mkItem(fServicio.id, {
          title: "Aterrizar metodología",
          measurementType: "hito",
          doneCriteria: "Documento de metodología aprobado",
          targetDate: d("2026-07-18"),
          status: "done",
        }),
        mkItem(fServicio.id, {
          title: "Diseñar contenido y frameworks",
          measurementType: "hito",
          doneCriteria: "5 cartas descriptivas y su canvas",
          targetDate: d("2026-08-05"),
          status: "inprogress",
        }),
        mkItem(fServicio.id, {
          title: "Producción de materiales y contenido",
          measurementType: "hito",
          doneCriteria: "Todo montado en Kajabi",
          targetDate: d("2026-07-25"),
          status: "pending",
        }),
        mkItem(fServicio.id, {
          title: "Acoplar herramienta tecnológica",
          measurementType: "hito",
          doneCriteria: "Companion app creada",
          targetDate: d("2026-07-10"),
          status: "pending",
        }),
        // 📈 Tasas — Generar demanda
        mkItem(fDemanda.id, {
          title: "Leads generados",
          measurementType: "tasa",
          meta: 40,
          real: 36,
          period: "mes",
          qualityNote: "calidad media, 3 con fit alto",
        }),
        mkItem(fDemanda.id, {
          title: "Contenido publicado (RRSS)",
          measurementType: "tasa",
          meta: 30,
          real: 8,
          period: "mes",
        }),
        // 🎲 Apuesta — Construir la oferta
        mkItem(fOferta.id, {
          title: "AB System para corporativos",
          measurementType: "apuesta",
          hypothesis: "El rediseño de sistema operativo se vende a corporativos",
          progressSignal: "Un corporativo pide una propuesta formal",
          weekTest: "Entrevista con Ana Fer sobre el pitch",
          betStatus: "stalled",
          lastMovedAt: d("2026-07-05"),
        }),
        // 📈 Tasa — Aterrizar cuentas
        mkItem(fCuentas.id, {
          title: "Cuentas nuevas",
          measurementType: "tasa",
          meta: 3,
          real: 2,
          period: "Q",
          qualityNote: "2 en conversación",
        }),
        // 🎯 Hitos — ICONN
        mkItem(fIconn.id, {
          title: "Kickoff con cliente",
          measurementType: "hito",
          doneCriteria: "Acta firmada + alcance acordado",
          targetDate: d("2026-07-20"),
          status: "done",
        }),
        mkItem(fIconn.id, {
          title: "Sesión diseñada",
          measurementType: "hito",
          doneCriteria: "Guion aprobado internamente",
          targetDate: d("2026-08-05"),
          status: "inprogress",
        }),
      ]);

      ui.showModal({
        title: "¡Ejemplo sembrado!",
        text: "Se creó el tablero de ejemplo de Astrolab. Ya puedes verlo.",
        okText: "Ver tablero",
      });
    } catch (e) {
      console.error("seedBoardExample:", e);
      ui.showModal({
        title: "Error al sembrar",
        text: `No se pudo escribir. ${e?.message || ""} (Puede ser por reglas de Firestore.)`,
        okText: "Cerrar",
      });
    }
  },

  updateTriageConfig(newConfig) {
    if (!newConfig) return;
    const refDoc = doc(db, "triageQuestions", "default");
    setDoc(refDoc, newConfig, { merge: true }).catch((err) => {
      console.error("updateTriageConfig:", err);
      ui.showModal({
        title: "Error",
        text: "No se pudo guardar la configuración.",
      });
    });
  },
};

// ------------------ Carga de datos / presencia ------------------
function onLogin(user) {
  ui.showApp(user);
  state.user = user;
  requestRender();
  setupPresenceSystem(user);
  loadData();
}

function onLogout() {
  ui.hideModal();
  ui.hideApp();
  state.unsubscribe.forEach((unsub) => {
    try {
      unsub();
    } catch {}
  });
  state.unsubscribe = [];
  state.isInitialLoadComplete = false;
  state.onlineUsers = [];
  ui.renderOnlineUsers([]);
}

function loadData() {
  state.isInitialLoadComplete = false;
  let collectionsLoaded = 0;

  const checkAllLoaded = () => {
    collectionsLoaded++;
    if (collectionsLoaded >= 4) {
      state.isInitialLoadComplete = true;
      requestRender();
    }
  };

  const unsubTriage = onSnapshot(doc(db, "triageQuestions", "default"), (snap) => {
    state.triageConfig = snap.exists() ? snap.data() : { impact: [], effort: [] };
    checkAllLoaded();
  });

  const unsubProfiles = onSnapshot(query(profilesCollection), (snapshot) => {
    state.allUsers = snapshot.docs.map((d) => d.data());

    // --- LÓGICA DE INICIALIZACIÓN (MODIFICADA) ---
    if (!state.hasInitializedPersonViews) {
      // ALERTA: Borramos las líneas que hacían .add().
      // Al dejar el Set vacío, la interfaz interpretará que todo está cerrado.
      state.hasInitializedPersonViews = true;
    }
    // ---------------------------------------------

    checkAllLoaded();
  });

  const unsubLists = onSnapshot(query(listsCollection), (snapshot) => {
    state.taskLists = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const backlog = state.taskLists.find((l) => l.isBacklog);
    state.backlogId = backlog?.id ?? null;

    const sprints = state.taskLists.filter((l) => !l.isBacklog && !l.isArchived);
    if (!state.currentSprintId && sprints.length) {
      state.currentSprintId = sprints.sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
      )[0].id;
    }
    checkAllLoaded();
  });

  const unsubEpics = onSnapshot(query(epicsCollection), (snapshot) => {
    state.epics = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    checkAllLoaded();
    requestRender();
  });

  const unsubThemes = onSnapshot(query(themesCollection), (snapshot) => {
    state.themes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    checkAllLoaded();
  });
  const unsubPrograms = onSnapshot(query(programsCollection), (snapshot) => {
    state.programs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    requestRender();
  });
  const unsubSnapshots = onSnapshot(query(weeklySnapshotsCollection), (snapshot) => {
    state.weeklySnapshots = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    requestRender();
  });
  const unsubHandbook = onSnapshot(query(handbookCollection), (snapshot) => {
    state.handbookEntries = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    checkAllLoaded();
  });
  const unsubTasks = onSnapshot(query(tasksCollection), (snapshot) => {
    state.tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    requestRender();

    const modalContent = document.getElementById("modal-content");
    const activeId = modalContent?.dataset.activeTaskId;

    if (activeId) {
      const updatedTask = state.tasks.find((t) => t.id === activeId);
      if (updatedTask) {
        ui.renderTaskDetails(updatedTask, state);
      }
    }
  });

  state.unsubscribe.push(
    unsubTriage,
    unsubProfiles,
    unsubLists,
    unsubEpics,
    unsubThemes,
    unsubPrograms,
    unsubSnapshots,
    unsubTasks
  );
}

function setupPresenceSystem(user) {
  const rtdb = getRtdb();
  const userRef = ref(rtdb, `/status/${user.uid}`);
  const offline = { state: "offline", last_changed: rtdbServerTimestamp() };
  const online = {
    state: "online",
    last_changed: rtdbServerTimestamp(),
    displayName: user.displayName,
    photoURL: user.photoURL,
    email: user.email,
  };

  const connectedRef = ref(rtdb, ".info/connected");
  onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;
    onDisconnect(userRef)
      .set(offline)
      .then(() => set(userRef, online));
  });

  const statusRef = ref(rtdb, "/status");
  const unsub = onValue(statusRef, (snap) => {
    const statuses = snap.val() || {};
    let onlineUsers = Object.values(statuses).filter((s) => s.state === "online");
    if (user?.displayName && !onlineUsers.some((u) => u.email === user.email)) {
      onlineUsers.push({
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        state: "online",
      });
    }
    state.onlineUsers = onlineUsers;
    ui.renderOnlineUsers(state.onlineUsers);
  });
  state.unsubscribe.push(unsub);
}

// ------------------ Otros ------------------
function handleDeepLink() {
  const hash = window.location.hash;
  if (!hash?.startsWith("#task/")) return;
  const id = hash.substring(6);
  const t = getTaskById(id);
  if (t) ui.openTaskDetailsModal(t);
  else console.warn(`Tarea no encontrada: ${id}`);
}

function checkSprintCapacity() {
  const sprint = state.taskLists.find((l) => l.id === state.currentSprintId);
  const warnings = document.querySelectorAll('[id^="sprint-capacity-warning-"]');
  if (!sprint?.capacity || sprint.capacity <= 0)
    return warnings.forEach((el) => el.classList.add("hidden"));

  const current = state.tasks
    .filter((t) => t.listId === state.currentSprintId)
    .reduce((sum, t) => sum + (t.points || 0), 0);

  const exceeded = current > sprint.capacity;
  warnings.forEach((el) => {
    if (exceeded) {
      el.classList.remove("hidden");
      el.textContent = `${current}/${sprint.capacity} Pts`;
    } else {
      el.classList.add("hidden");
    }
  });
}

function checkUnreadActivity() {
  if (!state.user) return;
  const indicator = document.getElementById("activity-unread-indicator");
  if (!indicator) return;

  const me = state.user.email;
  const myTasks = state.tasks.filter((t) => t.assignee === me);
  const hasUnread = myTasks.some((t) =>
    t.comments?.some((c) => c.authorEmail !== me && !c.readBy?.includes(me))
  );
  indicator.classList.toggle("hidden", !hasUnread);
}

function setupUpdateNotifier() {
  const banner = document.getElementById("update-banner");
  const refreshButton = document.getElementById("update-banner-refresh");
  if (!banner || !refreshButton) return;

  const targets = ["/index.html", "/js/core/app.js", "/js/ui/ui.js", "/styles/output.css"];
  const pollIntervalMs = 5 * 60 * 1000;
  let bannerShown = false;
  const baseline = new Map();

  const parseTime = (value) => {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  };

  const showBanner = () => {
    if (bannerShown) return;
    bannerShown = true;
    banner.classList.remove("hidden");
  };

  const fetchVersion = async (path, useHead) => {
    const options = { cache: "no-store" };
    if (useHead) options.method = "HEAD";
    const response = await fetch(path, options);
    if (!response.ok) throw new Error("No version response");
    return {
      lastModified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
    };
  };

  const fetchRemoteVersion = async (path) => {
    try {
      return await fetchVersion(path, true);
    } catch (err) {
      try {
        return await fetchVersion(path, false);
      } catch (innerErr) {
        return null;
      }
    }
  };

  const bootstrapVersion = async () => {
    const results = await Promise.all(targets.map((path) => fetchRemoteVersion(path)));
    results.forEach((remote, index) => {
      const path = targets[index];
      const record = {
        etag: remote?.etag || null,
        lastModified: parseTime(remote?.lastModified),
      };
      if (!record.lastModified && path === "/index.html") {
        record.lastModified = parseTime(document.lastModified);
      }
      baseline.set(path, record);
    });
  };

  const checkForUpdate = async () => {
    if (bannerShown || navigator?.onLine === false) return;
    const results = await Promise.all(targets.map((path) => fetchRemoteVersion(path)));
    results.forEach((remote, index) => {
      if (bannerShown || !remote) return;
      const path = targets[index];
      const previous = baseline.get(path) || { etag: null, lastModified: null };

      if (remote.etag) {
        if (previous.etag && remote.etag !== previous.etag) {
          showBanner();
          return;
        }
        if (!previous.etag) {
          previous.etag = remote.etag;
          baseline.set(path, previous);
          return;
        }
      }

      const remoteTime = parseTime(remote.lastModified);
      if (remoteTime && previous.lastModified && remoteTime > previous.lastModified + 1000) {
        showBanner();
        return;
      }
      if (remoteTime && !previous.lastModified) {
        previous.lastModified = remoteTime;
        baseline.set(path, previous);
      }
    });
  };

  refreshButton.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString());
    window.location.href = url.toString();
  });

  bootstrapVersion().then(() => {
    setTimeout(checkForUpdate, 15000);
    setInterval(checkForUpdate, pollIntervalMs);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
}

const style = document.createElement("style");
style.textContent = `
#online-users-container{min-height:48px;max-width:100vw;overflow-x:auto;overflow-y:visible;display:flex;flex-wrap:nowrap;align-items:center;background:transparent}
#online-users-container>div{flex:0 0 auto}
`;
document.head.appendChild(style);

window.addEventListener("load", () => {
  ui.initializeEventListeners(state, actions);
  ui.initializeAuthButtons(actions);
  handleAuth(state, onLogin, onLogout);
  setupUpdateNotifier();
  console.log("App iniciada.");
});
