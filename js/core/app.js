// app.js
import {
  db,
  getRtdb,
  listsCollection,
  tasksCollection,
  epicsCollection,
  themesCollection,
  profilesCollection,
  handbookCollection,
} from "./firebase.js";
import {
  handleAuth,
  login,
  logout,
  getCalendarAccessToken,
} from "../integrations/auth.js";
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

// ------------------ Estado global ------------------
const state = {
  user: null,
  tasks: [],
  taskLists: [],
  epics: [],
  themes: [],
  allUsers: [],
  onlineUsers: [],
  backlogId: null,
  currentSprintId: null,
  unsubscribe: [],
  timelineDate: new Date(),
  draggedTaskId: null,
  sprintifyCalendarId: null,
  googleAccessToken: null,
  calendarStatus: "disconnected",
  isInitialLoadComplete: false,
  expandedPersonViews: new Set(),
  expandedEpicIds: new Set(),
  handbookEntries: [],
  triageConfig: null,
  sprintsSummaryFilter: "active", // Valor por defecto: 'active' o 'en progreso'
};

// ------------------ Render throttle ------------------
let renderRequest = null;
function requestRender() {
  if (renderRequest) cancelAnimationFrame(renderRequest);
  renderRequest = requestAnimationFrame(() => {
    if (state.isInitialLoadComplete) {
      // En lugar de redibujar todo, solo manejamos la vista actual.
      ui.handleRouteChange(state);

      // Mantenemos las renderizaciones que sí deben ser globales y constantes.
      ui.renderSprintSelector(state);
      ui.renderCalendarButton(state);
      ui.renderOnlineUsers(state.onlineUsers);
      ui.renderActiveSprintTitle(state);
      ui.updateSprintCapacityInput(state);
    }
  });
}

// ------------------ Pequeños helpers ------------------
const getTaskById = (id) => state.tasks.find((t) => t.id === id);
const assertUserOr = (fallback) => (state.user ? true : (fallback?.(), false));

// ------------------ Acciones ------------------
const actions = {
  // ---- Tareas / Comentarios / Epics / Sprints ----
  async addNewTask(title, listId) {
    if (
      !assertUserOr(() =>
        ui.showModal({
          title: "Sesión requerida",
          text: "Inicia sesión para crear tareas.",
        }),
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
      createdBy: state.user.email,
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
  async updateTask(taskId, updates) {
    if (!taskId || !updates) return;
    const patch = { ...updates };
    // Permite escribir histories como arrayUnion declarativo
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
      callback: async (ok) =>
        ok && deleteDoc(doc(tasksCollection, taskId)).catch(console.error),
    });
  },
  returnTaskToBacklog(taskId) {
    if (!taskId || !state.backlogId) return;

    const updates = {
      listId: state.backlogId,
      kanbanStatus: "todo",
      history: arrayUnion({
        action: "Regresado al Backlog",
        user: state.user.displayName,
        timestamp: Timestamp.now(),
      }),
    };

    // Llama a la función que ya sabe cómo actualizar tareas
    actions.updateTask(taskId, updates);
  },

  async moveTasksToSprint(taskIds, sprintId) {
    if (!sprintId || !Array.isArray(taskIds) || taskIds.length === 0) return;
    const batch = writeBatch(db);
    taskIds.forEach(
      (id) =>
        id && batch.update(doc(tasksCollection, id), { listId: sprintId }),
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
      // USAMOS CONFIRM NATIVO PARA NO CERRAR EL MODAL DE TAREA
      if (confirm("¿Estás seguro de borrar este comentario?")) {
        try {
          await updateDoc(doc(tasksCollection, taskId), {
            comments: arrayRemove(comment),
          });
        } catch (e) {
          console.error("delete-comment:", e);
        }
      }
      return; // Salimos sin llamar a ui.showModal
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
      const nextReadBy = isRead
        ? readBy.filter((x) => x !== me)
        : [...readBy, me];
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
    const {
      title,
      sequence, // <--- Recibimos sequence
      start,
      end,
      capacity = 0,
      color,
      epicId,
    } = result || {};

    if (!title || !start || !end)
      return ui.showModal({ title: "Error", text: "Faltan datos." });

    addDoc(listsCollection, {
      title,
      sequence: Number(sequence) || 0, // <--- GUARDAMOS sequence
      startDate: Timestamp.fromDate(new Date(`${start}T00:00:00`)),
      endDate: Timestamp.fromDate(new Date(`${end}T00:00:00`)),
      isBacklog: false,
      capacity: Number(capacity) || 0,
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
      color,
      epicId: epicId || null,
      epicIds: epicId ? [epicId] : [],
    }).catch((e) => console.error("addNewSprint:", e));
  },

  updateSprint(sprintId, result) {
    const {
      title,
      sequence,
      start,
      end,
      capacity = 0,
      color,
      epicId, // <--- 1. AHORA LO RECIBIMOS
    } = result || {};

    // Objeto de actualización
    const updates = {
      title,
      startDate: Timestamp.fromDate(new Date(`${start}T00:00:00`)),
      endDate: Timestamp.fromDate(new Date(`${end}T00:00:00`)),
      capacity: Number(capacity) || 0,
      color,
      epicId: epicId || null, // <--- 2. LO GUARDAMOS
    };

    // Actualizamos también el array para compatibilidad total!
    if (epicId) {
      updates.epicIds = [epicId];
    }

    // Solo actualizamos sequence si viene definido
    if (sequence !== undefined) {
      updates.sequence = Number(sequence);
    }

    updateDoc(doc(listsCollection, sprintId), updates).catch((e) =>
      console.error("updateSprint:", e),
    );
  },

  updateSprintCapacity(sprintId, newCapacity) {
    const cap = Number(newCapacity);
    if (!sprintId || Number.isNaN(cap)) return;
    updateDoc(doc(listsCollection, sprintId), { capacity: cap }).catch(
      console.error,
    );
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
          const tasksQuery = query(
            tasksCollection,
            where("listId", "==", sprintId),
          );
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

          // ▼▼ LÓGICA AÑADIDA PARA ACTUALIZAR LA VISTA ▼▼
          // Si el sprint que archivamos era el que estábamos viendo...
          if (sprintId === state.currentSprintId) {
            // Buscamos los sprints que todavía están activos.
            const availableSprints = state.taskLists.filter(
              (l) => !l.isBacklog && !l.isArchived && l.id !== sprintId,
            );

            // Cambiamos al primero disponible, o a null si no hay.
            state.currentSprintId =
              availableSprints.length > 0 ? availableSprints[0].id : null;

            // Forzamos un redibujado inmediato de la pantalla.
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
      archivedAt: null, // Limpiamos la fecha de archivo
      endDate: Timestamp.fromDate(new Date(`${newEndDate}T00:00:00`)),
    };

    updateDoc(doc(listsCollection, sprintId), updates).catch((e) =>
      console.error("Error al restaurar sprint:", e),
    );
  },
  addNewEpic(result) {
    const title = (result?.title ?? "").trim();
    if (!title)
      return ui.showModal({
        title: "Error de Validación",
        text: "El nombre del Epic no puede estar vacío.",
      });

    // Estructura mejorada del Epic
    addDoc(epicsCollection, {
      title,
      description: result.description ?? "",
      status: result.status ?? "Por Empezar",
      color: result.color || "#475569",
      themeId: result.themeId || null,
      // --- NUEVOS CAMPOS ESTRATÉGICOS ---
      startDate: result.startDate
        ? Timestamp.fromDate(new Date(`${result.startDate}T00:00:00`))
        : serverTimestamp(),
      endDate: result.endDate
        ? Timestamp.fromDate(new Date(`${result.endDate}T00:00:00`))
        : null,
      keyResults: result.keyResults || [], // Guardaremos un array de textos por ahora
      createdAt: serverTimestamp(),
      createdBy: state.user?.email ?? null,
    }).catch((e) => console.error("addNewEpic:", e));
  },

  updateEpic(epicId, result) {
    if (!epicId || !result?.title) return;
    // El 'themeId' vendrá dentro del objeto 'result'
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
          const q = query(
            listsCollection,
            where("epicIds", "array-contains", epicId),
          );
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
          // Desvincular Epics
          const q = query(epicsCollection, where("themeId", "==", themeId));
          const s = await getDocs(q);
          s.forEach((d) => b.update(d.ref, { themeId: null }));

          // Borrar Tema
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
    taskIds.forEach(
      (id, idx) => id && batch.update(doc(tasksCollection, id), { order: idx }),
    );
    try {
      await batch.commit();
    } catch (e) {
      console.error("updateBacklogOrder:", e);
    }
  },

  // ---- Triage (impact / effort) ----
  updateTriageScore(taskId) {
    if (!state.triageConfig) return console.error("Triage config no cargada.");
    const impactChecks = document.querySelectorAll(
      "#triage-impact-questions input:checked",
    );
    const effortChecks = document.querySelectorAll(
      "#triage-effort-questions input:checked",
    );

    const impactSel = Array.from(impactChecks).map((cb) => cb.dataset.id);
    const effortSel = Array.from(effortChecks).map((cb) => cb.dataset.id);

    const sumBy = (arr, bank) =>
      arr.reduce(
        (acc, id) => acc + (bank.find((q) => q.id === id)?.weight ?? 0),
        0,
      );

    const impact = sumBy(impactSel, state.triageConfig.impact || []);
    const effort = sumBy(effortSel, state.triageConfig.effort || []);

    actions.updateTask(taskId, {
      impact,
      effort,
      triageImpactSelections: impactSel,
      triageEffortSelections: effortSel,
    });
  },

  // ---- UI / Navegación ----
  setDraggedTaskId: (id) => {
    state.draggedTaskId = id;
  },
  setTimelineDate: (inc) => {
    state.timelineDate.setMonth(state.timelineDate.getMonth() + inc);
    requestRender();
  },
  setCurrentSprintId: (id) => {
    state.currentSprintId = id;
    requestRender();
  },
  handleRouteChange: () => {
    requestRender();
  },
  togglePersonView: (email) => {
    state.expandedPersonViews.has(email)
      ? state.expandedPersonViews.delete(email)
      : state.expandedPersonViews.add(email);
    requestRender();
  },
  toggleEpicDetails: (id) => {
    state.expandedEpicIds.has(id)
      ? state.expandedEpicIds.delete(id)
      : state.expandedEpicIds.add(id);
    requestRender();
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
    if (!state.googleAccessToken)
      throw new Error("Primero conecta Google Calendar.");
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
    const act = async (token) =>
      calendar.createTaskEvent(task, state.sprintifyCalendarId, token);
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
        t.comments?.some(
          (c) => c.authorEmail !== me && !c.readBy?.includes(me),
        ),
    );
    mine.forEach((t) => {
      const updated = t.comments.map((c) =>
        c.authorEmail !== me && !c.readBy?.includes(me)
          ? { ...c, readBy: [...(c.readBy || []), me] }
          : c,
      );
      batch.update(doc(tasksCollection, t.id), { comments: updated });
    });
    if (mine.length)
      batch.commit().catch((e) => console.error("markAllAsRead:", e));
  },

  // --- AGREGAR ESTO DENTRO DE "actions" en app.js ---
  async toggleEpicKr(epicId, krIndex) {
    if (!epicId || krIndex === undefined) return;

    // 1. Buscamos el epic actual para ver qué tiene marcado
    const epic = state.epics.find((e) => e.id === epicId);
    if (!epic) return;

    const currentIndices = epic.completedKrIndices || [];
    const idx = Number(krIndex);
    let newIndices;

    // 2. Si ya está, lo quitamos. Si no está, lo ponemos.
    if (currentIndices.includes(idx)) {
      newIndices = arrayRemove(idx);
    } else {
      newIndices = arrayUnion(idx);
    }

    try {
      // 3. Guardamos en Firebase
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

    // Convertimos el objeto Delta a un objeto plano que Firestore entiende
    const plainContent = JSON.parse(JSON.stringify(content));

    addDoc(handbookCollection, {
      title,
      content: plainContent, // Usamos el objeto plano
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

    // Convertimos el objeto Delta a un objeto plano
    const plainContent = JSON.parse(JSON.stringify(content));

    updateDoc(doc(handbookCollection, entryId), {
      title,
      content: plainContent, // Usamos el objeto plano
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
      callback: (ok) =>
        ok && deleteDoc(doc(handbookCollection, entryId)).catch(console.error),
    });
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
  setupPresenceSystem(user);
  loadData();
}

function onLogout() {
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

  // Función interna para verificar si todo está listo
  const checkAllLoaded = () => {
    collectionsLoaded++;
    // Bajamos el requerimiento a 4 para asegurar que al menos cargue lo básico
    if (collectionsLoaded >= 4) {
      state.isInitialLoadComplete = true;
      requestRender();
    }
  };

  const unsubTriage = onSnapshot(
    doc(db, "triageQuestions", "default"),
    (snap) => {
      state.triageConfig = snap.exists()
        ? snap.data()
        : { impact: [], effort: [] };
      checkAllLoaded();
    },
  );

  const unsubProfiles = onSnapshot(query(profilesCollection), (snapshot) => {
    state.allUsers = snapshot.docs.map((d) => d.data());
    checkAllLoaded();
  });

  const unsubLists = onSnapshot(query(listsCollection), (snapshot) => {
    state.taskLists = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const backlog = state.taskLists.find((l) => l.isBacklog);
    state.backlogId = backlog?.id ?? null;

    // Lógica de selección de sprint actual
    const sprints = state.taskLists.filter(
      (l) => !l.isBacklog && !l.isArchived,
    );
    if (!state.currentSprintId && sprints.length) {
      state.currentSprintId = sprints.sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
      )[0].id;
    }
    checkAllLoaded();
  });

  const unsubEpics = onSnapshot(query(epicsCollection), (snapshot) => {
    state.epics = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    checkAllLoaded();
  });

  const unsubThemes = onSnapshot(query(themesCollection), (snapshot) => {
    state.themes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    checkAllLoaded();
  });
  const unsubHandbook = onSnapshot(query(handbookCollection), (snapshot) => {
    state.handbookEntries = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    checkAllLoaded();
  });
  const unsubTasks = onSnapshot(query(tasksCollection), (snapshot) => {
    // 1. Actualizamos el estado local de tareas
    state.tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 2. Renderizamos la vista de fondo (Kanban, Backlog, etc.)
    requestRender();

    // 3. ¡ESTA ES LA CLAVE! Verificamos si hay un modal de tarea abierto
    const modalContent = document.getElementById("modal-content");
    const activeId = modalContent?.dataset.activeTaskId;

    if (activeId) {
      // Buscamos la tarea actualizada en el nuevo estado
      const updatedTask = state.tasks.find((t) => t.id === activeId);
      if (updatedTask) {
        // Forzamos a ui.js a renderizar los detalles con la data fresca
        ui.renderTaskDetails(updatedTask, state);
      }
    }
  });

  // Guardar unsubs para limpiar al cerrar sesión
  state.unsubscribe.push(
    unsubTriage,
    unsubProfiles,
    unsubLists,
    unsubEpics,
    unsubThemes,
    unsubTasks,
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
    let onlineUsers = Object.values(statuses).filter(
      (s) => s.state === "online",
    );
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
  const warnings = document.querySelectorAll(
    '[id^="sprint-capacity-warning-"]',
  );
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
    t.comments?.some((c) => c.authorEmail !== me && !c.readBy?.includes(me)),
  );
  indicator.classList.toggle("hidden", !hasUnread);
}

// Forzar visibilidad/scroll de usuarios en línea (estilo)
const style = document.createElement("style");
style.textContent = `
#online-users-container{min-height:48px;max-width:100vw;overflow-x:auto;overflow-y:visible;display:flex;flex-wrap:nowrap;align-items:center;background:transparent}
#online-users-container>div{flex:0 0 auto}
`;
document.head.appendChild(style);

// Bootstrap
window.addEventListener("load", () => {
  ui.initializeEventListeners(state, actions);
  ui.initializeAuthButtons(actions);
  handleAuth(state, onLogin, onLogout);
  console.log("App iniciada.");
});
