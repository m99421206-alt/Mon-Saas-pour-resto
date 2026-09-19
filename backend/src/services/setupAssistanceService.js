/**
 * Demandes d'assistance installation — landing, onboarding, CRM admin.
 */

"use strict";

var { getPool } = require("../config/database");

var VALID_STATUSES = [
  "new",
  "contacted",
  "info_received",
  "in_progress",
  "ready_to_review",
  "correction_needed",
  "completed",
  "cancelled",
];

var VALID_SOURCES = ["landing", "onboarding"];

var STATUS_LABELS = {
  new: "Nouvelle demande",
  contacted: "Contacté",
  info_received: "Informations reçues",
  in_progress: "Installation en cours",
  ready_to_review: "Prêt à vérifier",
  correction_needed: "Correction demandée",
  completed: "Installation terminée",
  cancelled: "Annulée",
};

var ALLOWED_TRANSITIONS = {
  new: ["contacted", "cancelled"],
  contacted: ["info_received", "cancelled"],
  info_received: ["in_progress", "cancelled"],
  in_progress: ["ready_to_review", "cancelled"],
  ready_to_review: ["completed", "correction_needed"],
  correction_needed: ["in_progress"],
  completed: [],
  cancelled: ["new", "contacted"],
};

var DEFAULT_CHECKLIST = {
  info: {
    restaurant_name: false,
    contact_name: false,
    whatsapp: false,
    city: false,
  },
  received: {
    menu: false,
    logo: false,
    photos: false,
    extra_info: false,
  },
  config: {
    restaurant_created: false,
    account_created: false,
    categories: false,
    products: false,
    prices: false,
    photos_added: false,
    branding: false,
    whatsapp: false,
    qr_code: false,
  },
  verification: {
    mobile_test: false,
    restaurant_verified: false,
    corrections: false,
    installation_done: false,
  },
};

var EVENT_LABELS = {
  created: "Demande reçue",
  status_changed: "Statut modifié",
  note_added: "Note ajoutée",
  whatsapp_marked: "Contact WhatsApp enregistré",
  restaurant_linked: "Restaurant lié",
  restaurant_created: "Compte restaurant créé",
  checklist_updated: "Checklist mise à jour",
  cancelled: "Demande annulée",
  reactivated: "Demande réactivée",
};

function isMissingTableError(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146);
}

function normalizeStatus(value) {
  var st = String(value || "")
    .trim()
    .toLowerCase();
  return VALID_STATUSES.indexOf(st) !== -1 ? st : null;
}

function canTransition(fromStatus, toStatus) {
  var from = normalizeStatus(fromStatus);
  var to = normalizeStatus(toStatus);
  if (!from || !to) {
    return false;
  }
  var allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.indexOf(to) !== -1;
}

function parseChecklist(raw) {
  if (!raw) {
    return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
  }
  if (typeof raw === "object") {
    return mergeChecklist(raw);
  }
  if (typeof raw === "string") {
    try {
      return mergeChecklist(JSON.parse(raw));
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
}

function mergeChecklist(input) {
  var base = JSON.parse(JSON.stringify(DEFAULT_CHECKLIST));
  var sections = ["info", "received", "config", "verification"];
  sections.forEach(function (section) {
    if (input[section] && typeof input[section] === "object") {
      Object.keys(base[section]).forEach(function (key) {
        if (typeof input[section][key] === "boolean") {
          base[section][key] = input[section][key];
        }
      });
    }
  });
  return base;
}

function mapRequestRow(row) {
  if (!row) {
    return null;
  }
  var st = normalizeStatus(row.status) || "new";
  var linkedId =
    row.linked_restaurant_id != null && Number(row.linked_restaurant_id) > 0 ?
      Number(row.linked_restaurant_id)
    : null;
  var restId =
    row.restaurant_id != null && Number(row.restaurant_id) > 0 ?
      Number(row.restaurant_id)
    : null;
  return {
    id: row.id,
    source: String(row.source || "").trim() || "landing",
    restaurant_name: String(row.restaurant_name || "").trim() || "—",
    contact_name: String(row.contact_name || "").trim() || "—",
    phone: row.phone != null && String(row.phone).trim() !== "" ? String(row.phone).trim() : null,
    city: row.city != null && String(row.city).trim() !== "" ? String(row.city).trim() : null,
    status: st,
    status_label: STATUS_LABELS[st] || st,
    restaurant_id: restId,
    linked_restaurant_id: linkedId,
    linked_restaurant_name:
      row.linked_restaurant_name != null && String(row.linked_restaurant_name).trim() !== "" ?
        String(row.linked_restaurant_name).trim()
      : null,
    owner_email:
      row.owner_email != null && String(row.owner_email).trim() !== "" ?
        String(row.owner_email).trim()
      : null,
    last_contacted_at:
      row.last_contacted_at ? new Date(row.last_contacted_at).toISOString() : null,
    last_activity_at:
      row.last_activity_at ?
        new Date(row.last_activity_at).toISOString()
      : row.updated_at ?
        new Date(row.updated_at).toISOString()
      : row.created_at ?
        new Date(row.created_at).toISOString()
      : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    checklist: parseChecklist(row.checklist_json),
  };
}

function mapEventRow(row) {
  var payload = null;
  if (row.payload_json) {
    if (typeof row.payload_json === "object") {
      payload = row.payload_json;
    } else {
      try {
        payload = JSON.parse(String(row.payload_json));
      } catch (e) {
        payload = null;
      }
    }
  }
  return {
    id: row.id,
    event_type: String(row.event_type || ""),
    event_label: EVENT_LABELS[row.event_type] || String(row.event_type || "Événement"),
    detail: row.detail != null ? String(row.detail) : null,
    admin_user_id: row.admin_user_id != null ? Number(row.admin_user_id) : null,
    admin_email: row.admin_email != null ? String(row.admin_email) : null,
    payload: payload,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function insertEvent(pool, params) {
  var requestId = Number(params.requestId);
  if (!Number.isInteger(requestId) || requestId < 1) {
    return null;
  }
  var eventType = String(params.eventType || "").trim().slice(0, 48);
  var detail = params.detail != null ? String(params.detail).trim().slice(0, 2048) : null;
  var adminUserId =
    params.adminUserId != null && Number(params.adminUserId) > 0 ?
      Number(params.adminUserId)
    : null;
  var payloadJson = params.payload != null ? JSON.stringify(params.payload) : null;

  var [result] = await pool.query(
    "INSERT INTO setup_assistance_request_events " +
      "(request_id, event_type, detail, admin_user_id, payload_json) VALUES (?, ?, ?, ?, ?)",
    [requestId, eventType, detail, adminUserId, payloadJson],
  );

  await pool.query(
    "UPDATE setup_assistance_requests SET last_activity_at = NOW() WHERE id = ? LIMIT 1",
    [requestId],
  );

  return result.insertId;
}

async function touchActivity(pool, requestId) {
  await pool.query(
    "UPDATE setup_assistance_requests SET last_activity_at = NOW() WHERE id = ? LIMIT 1",
    [requestId],
  );
}

function buildFilterClause(filter) {
  var f = String(filter || "all").trim().toLowerCase();
  if (f === "new") {
    return { clause: "sar.status = 'new'", vals: [] };
  }
  if (f === "to_contact") {
    return { clause: "sar.status = 'new'", vals: [] };
  }
  if (f === "in_progress") {
    return {
      clause:
        "sar.status IN ('contacted', 'info_received', 'in_progress', 'correction_needed')",
      vals: [],
    };
  }
  if (f === "to_review") {
    return { clause: "sar.status = 'ready_to_review'", vals: [] };
  }
  if (f === "completed") {
    return { clause: "sar.status = 'completed'", vals: [] };
  }
  if (f === "cancelled") {
    return { clause: "sar.status = 'cancelled'", vals: [] };
  }
  if (f === "active") {
    return {
      clause: "sar.status NOT IN ('completed', 'cancelled')",
      vals: [],
    };
  }
  return { clause: "", vals: [] };
}

function buildSearchClause(q) {
  var raw = String(q || "").trim().slice(0, 160);
  if (!raw) {
    return { clause: "", vals: [] };
  }
  var like = "%" + raw + "%";
  return {
    clause:
      "(sar.restaurant_name LIKE ? OR sar.contact_name LIKE ? OR IFNULL(sar.phone,'') LIKE ? OR IFNULL(sar.city,'') LIKE ?)",
    vals: [like, like, like, like],
  };
}

async function findOpenOnboardingRequest(pool, restaurantId) {
  var [rows] = await pool.query(
    "SELECT id FROM setup_assistance_requests " +
      "WHERE source = 'onboarding' AND restaurant_id = ? AND status NOT IN ('completed', 'cancelled') " +
      "ORDER BY id DESC LIMIT 1",
    [restaurantId],
  );
  return rows.length ? rows[0] : null;
}

async function findOpenLandingDuplicate(pool, restaurantName, phone) {
  var [rows] = await pool.query(
    "SELECT id FROM setup_assistance_requests " +
      "WHERE source = 'landing' AND status NOT IN ('completed', 'cancelled') " +
      "AND restaurant_name = ? AND IFNULL(phone, '') = ? " +
      "ORDER BY id DESC LIMIT 1",
    [restaurantName, phone || ""],
  );
  return rows.length ? rows[0] : null;
}

async function createLandingRequest(input) {
  var pool = getPool();
  var restaurantName = String(input.restaurantName || "").trim().slice(0, 160);
  var contactName = String(input.contactName || "").trim().slice(0, 160);
  var phone = String(input.phone || "").trim().slice(0, 32);
  var city = String(input.city || "").trim().slice(0, 120);

  var existing = await findOpenLandingDuplicate(pool, restaurantName, phone);
  if (existing) {
    return { id: existing.id, duplicate: true };
  }

  var [result] = await pool.query(
    "INSERT INTO setup_assistance_requests " +
      "(source, restaurant_id, restaurant_name, contact_name, phone, city, status, linked_restaurant_id, last_activity_at, checklist_json) " +
      "VALUES ('landing', NULL, ?, ?, ?, ?, 'new', NULL, NOW(), ?)",
    [restaurantName, contactName, phone, city, JSON.stringify(DEFAULT_CHECKLIST)],
  );

  var requestId = result.insertId;
  await insertEvent(pool, {
    requestId: requestId,
    eventType: "created",
    detail: "Demande reçue depuis la page d'accueil",
    adminUserId: null,
    payload: { source: "landing" },
  });

  return { id: requestId, duplicate: false };
}

async function createOnboardingRequest(restaurant) {
  var pool = getPool();
  var restaurantId = Number(restaurant.id);
  if (!Number.isInteger(restaurantId) || restaurantId < 1) {
    throw new Error("INVALID_RESTAURANT");
  }

  var existing = await findOpenOnboardingRequest(pool, restaurantId);
  if (existing) {
    return { id: existing.id, duplicate: true };
  }

  var restaurantName = String(restaurant.name || "").trim().slice(0, 160) || "—";
  var contactName =
    restaurant.full_name != null && String(restaurant.full_name).trim() !== "" ?
      String(restaurant.full_name).trim().slice(0, 160)
    : "—";
  var phone =
    restaurant.whatsapp != null && String(restaurant.whatsapp).trim() !== "" ?
      String(restaurant.whatsapp).trim().slice(0, 32)
    : null;
  var city =
    restaurant.city != null && String(restaurant.city).trim() !== "" ?
      String(restaurant.city).trim().slice(0, 120)
    : null;

  var [result] = await pool.query(
    "INSERT INTO setup_assistance_requests " +
      "(source, restaurant_id, restaurant_name, contact_name, phone, city, status, linked_restaurant_id, last_activity_at, checklist_json) " +
      "VALUES ('onboarding', ?, ?, ?, ?, ?, 'new', ?, NOW(), ?)",
    [
      restaurantId,
      restaurantName,
      contactName,
      phone,
      city,
      restaurantId,
      JSON.stringify(DEFAULT_CHECKLIST),
    ],
  );

  var requestId = result.insertId;
  await insertEvent(pool, {
    requestId: requestId,
    eventType: "created",
    detail: "Demande reçue depuis l'onboarding",
    adminUserId: null,
    payload: { source: "onboarding", restaurant_id: restaurantId },
  });

  return { id: requestId, duplicate: false };
}

async function syncNeedsSetupHelpOnComplete(pool, requestRow) {
  var ids = [];
  if (requestRow.restaurant_id) {
    ids.push(Number(requestRow.restaurant_id));
  }
  if (
    requestRow.linked_restaurant_id &&
    ids.indexOf(Number(requestRow.linked_restaurant_id)) === -1
  ) {
    ids.push(Number(requestRow.linked_restaurant_id));
  }
  if (!ids.length) {
    return;
  }
  await pool.query(
    "UPDATE restaurants SET needs_setup_help = 0 WHERE id IN (?) AND COALESCE(needs_setup_help, 0) = 1",
    [ids],
  );
}

async function getRequestById(id) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT sar.*, u.email AS owner_email, lr.name AS linked_restaurant_name " +
      "FROM setup_assistance_requests sar " +
      "LEFT JOIN restaurants r ON r.id = sar.restaurant_id " +
      "LEFT JOIN users u ON u.id = r.user_id " +
      "LEFT JOIN restaurants lr ON lr.id = sar.linked_restaurant_id " +
      "WHERE sar.id = ? LIMIT 1",
    [id],
  );
  return rows.length ? rows[0] : null;
}

async function getRequestEvents(requestId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT e.*, u.email AS admin_email " +
      "FROM setup_assistance_request_events e " +
      "LEFT JOIN users u ON u.id = e.admin_user_id " +
      "WHERE e.request_id = ? ORDER BY e.created_at DESC, e.id DESC",
    [requestId],
  );
  return rows.map(mapEventRow);
}

async function getRequestDetail(id) {
  var row = await getRequestById(id);
  if (!row) {
    return null;
  }
  var events = await getRequestEvents(id);
  var notes = events.filter(function (e) {
    return e.event_type === "note_added";
  });
  var mapped = mapRequestRow(row);
  mapped.events = events;
  mapped.notes = notes;
  return mapped;
}

async function listRequests(options) {
  var pool = getPool();
  var page = options.page || 1;
  var pageSize = options.pageSize || 50;
  var offset = (page - 1) * pageSize;

  var filterParts = buildFilterClause(options.filter);
  var searchParts = buildSearchClause(options.q);

  var conditions = [];
  var vals = [];
  if (filterParts.clause) {
    conditions.push(filterParts.clause);
    vals = vals.concat(filterParts.vals);
  }
  if (searchParts.clause) {
    conditions.push(searchParts.clause);
    vals = vals.concat(searchParts.vals);
  }

  var whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  var [[countRow]] = await pool.query(
    "SELECT COUNT(*) AS n FROM setup_assistance_requests sar " + whereClause,
    vals,
  );
  var total = Number(countRow.n) || 0;
  var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  var listVals = vals.slice();
  listVals.push(pageSize, offset);

  var [rows] = await pool.query(
    "SELECT sar.*, u.email AS owner_email, lr.name AS linked_restaurant_name " +
      "FROM setup_assistance_requests sar " +
      "LEFT JOIN restaurants r ON r.id = sar.restaurant_id " +
      "LEFT JOIN users u ON u.id = r.user_id " +
      "LEFT JOIN restaurants lr ON lr.id = sar.linked_restaurant_id " +
      whereClause +
      " ORDER BY COALESCE(sar.last_activity_at, sar.updated_at, sar.created_at) DESC, sar.id DESC " +
      "LIMIT ? OFFSET ?",
    listVals,
  );

  return {
    items: rows.map(mapRequestRow),
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
  };
}

async function getStats() {
  var pool = getPool();
  var [[row]] = await pool.query(
    "SELECT " +
      "SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count, " +
      "SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS to_contact_count, " +
      "SUM(CASE WHEN status IN ('contacted','info_received','in_progress','correction_needed') THEN 1 ELSE 0 END) AS in_progress_count, " +
      "SUM(CASE WHEN status = 'ready_to_review' THEN 1 ELSE 0 END) AS to_review_count, " +
      "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count, " +
      "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count " +
      "FROM setup_assistance_requests",
  );
  return {
    new: Number(row.new_count) || 0,
    to_contact: Number(row.to_contact_count) || 0,
    in_progress: Number(row.in_progress_count) || 0,
    to_review: Number(row.to_review_count) || 0,
    completed: Number(row.completed_count) || 0,
    cancelled: Number(row.cancelled_count) || 0,
  };
}

async function updateRequestStatus(id, nextStatus, adminUserId) {
  var pool = getPool();
  var st = normalizeStatus(nextStatus);
  if (!st) {
    return { error: "INVALID_STATUS" };
  }

  var row = await getRequestById(id);
  if (!row) {
    return { error: "NOT_FOUND" };
  }

  var current = normalizeStatus(row.status) || "new";
  if (!canTransition(current, st)) {
    return { error: "INVALID_TRANSITION", from: current, to: st };
  }

  await pool.query("UPDATE setup_assistance_requests SET status = ?, last_activity_at = NOW() WHERE id = ? LIMIT 1", [
    st,
    id,
  ]);

  var eventType = "status_changed";
  if (st === "cancelled") {
    eventType = "cancelled";
  } else if (current === "cancelled" && (st === "new" || st === "contacted")) {
    eventType = "reactivated";
  }

  await insertEvent(pool, {
    requestId: id,
    eventType: eventType,
    detail:
      STATUS_LABELS[current] + " → " + STATUS_LABELS[st],
    adminUserId: adminUserId,
    payload: { from: current, to: st },
  });

  if (st === "completed") {
    await syncNeedsSetupHelpOnComplete(pool, row);
  }

  return { ok: true, status: st, previous: current };
}

async function markContacted(id, adminUserId) {
  var pool = getPool();
  var row = await getRequestById(id);
  if (!row) {
    return { error: "NOT_FOUND" };
  }

  await pool.query(
    "UPDATE setup_assistance_requests SET last_contacted_at = NOW(), last_activity_at = NOW() WHERE id = ? LIMIT 1",
    [id],
  );

  await insertEvent(pool, {
    requestId: id,
    eventType: "whatsapp_marked",
    detail: "Contact WhatsApp enregistré",
    adminUserId: adminUserId,
    payload: null,
  });

  return { ok: true };
}

async function addNote(id, text, adminUserId) {
  var pool = getPool();
  var row = await getRequestById(id);
  if (!row) {
    return { error: "NOT_FOUND" };
  }
  var note = String(text || "").trim().slice(0, 2000);
  if (!note) {
    return { error: "EMPTY_NOTE" };
  }

  var eventId = await insertEvent(pool, {
    requestId: id,
    eventType: "note_added",
    detail: note,
    adminUserId: adminUserId,
    payload: null,
  });

  return { ok: true, event_id: eventId };
}

async function updateChecklist(id, checklist, adminUserId) {
  var pool = getPool();
  var row = await getRequestById(id);
  if (!row) {
    return { error: "NOT_FOUND" };
  }
  var merged = mergeChecklist(checklist || {});
  await pool.query(
    "UPDATE setup_assistance_requests SET checklist_json = ?, last_activity_at = NOW() WHERE id = ? LIMIT 1",
    [JSON.stringify(merged), id],
  );

  await insertEvent(pool, {
    requestId: id,
    eventType: "checklist_updated",
    detail: "Checklist mise à jour",
    adminUserId: adminUserId,
    payload: merged,
  });

  return { ok: true, checklist: merged };
}

async function linkRestaurantToRequest(id, linkedRestaurantId, adminUserId) {
  var pool = getPool();
  var rid = Number(linkedRestaurantId);
  if (!Number.isInteger(rid) || rid < 1) {
    return { error: "INVALID_RESTAURANT" };
  }

  var row = await getRequestById(id);
  if (!row) {
    return { error: "NOT_FOUND" };
  }

  var [[restaurant]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [rid]);
  if (!restaurant) {
    return { error: "RESTAURANT_NOT_FOUND" };
  }

  await pool.query(
    "UPDATE setup_assistance_requests SET linked_restaurant_id = ?, last_activity_at = NOW() WHERE id = ? LIMIT 1",
    [rid, id],
  );

  await insertEvent(pool, {
    requestId: id,
    eventType: "restaurant_linked",
    detail: "Restaurant lié : " + String(restaurant.name || rid),
    adminUserId: adminUserId,
    payload: { restaurant_id: rid, restaurant_name: restaurant.name },
  });

  return { ok: true, linked_restaurant_id: rid, linked_restaurant_name: restaurant.name };
}

async function completeByRestaurantId(restaurantId) {
  var pool = getPool();
  var rid = Number(restaurantId);
  if (!Number.isInteger(rid) || rid < 1) {
    return { error: "INVALID_RESTAURANT" };
  }

  var [rows] = await pool.query(
    "SELECT id FROM setup_assistance_requests " +
      "WHERE status <> 'completed' AND status <> 'cancelled' AND (restaurant_id = ? OR linked_restaurant_id = ?) " +
      "ORDER BY id DESC LIMIT 1",
    [rid, rid],
  );

  if (rows.length) {
    await pool.query(
      "UPDATE setup_assistance_requests SET status = 'completed', last_activity_at = NOW() WHERE id = ? LIMIT 1",
      [rows[0].id],
    );
  }

  await pool.query(
    "UPDATE restaurants SET needs_setup_help = 0 WHERE id = ? AND COALESCE(needs_setup_help, 0) = 1 LIMIT 1",
    [rid],
  );

  return { ok: true };
}

async function recordRestaurantCreated(requestId, adminUserId, created) {
  var pool = getPool();
  await insertEvent(pool, {
    requestId: requestId,
    eventType: "restaurant_created",
    detail: "Compte restaurant créé : " + String(created.restaurantName || ""),
    adminUserId: adminUserId,
    payload: {
      restaurant_id: created.restaurantId,
      user_id: created.userId,
      email: created.email,
    },
  });
}

module.exports = {
  VALID_STATUSES: VALID_STATUSES,
  VALID_SOURCES: VALID_SOURCES,
  STATUS_LABELS: STATUS_LABELS,
  ALLOWED_TRANSITIONS: ALLOWED_TRANSITIONS,
  DEFAULT_CHECKLIST: DEFAULT_CHECKLIST,
  EVENT_LABELS: EVENT_LABELS,
  isMissingTableError: isMissingTableError,
  normalizeStatus: normalizeStatus,
  canTransition: canTransition,
  mapRequestRow: mapRequestRow,
  createLandingRequest: createLandingRequest,
  createOnboardingRequest: createOnboardingRequest,
  listRequests: listRequests,
  getRequestById: getRequestById,
  getRequestDetail: getRequestDetail,
  getStats: getStats,
  updateRequestStatus: updateRequestStatus,
  markContacted: markContacted,
  addNote: addNote,
  updateChecklist: updateChecklist,
  linkRestaurantToRequest: linkRestaurantToRequest,
  recordRestaurantCreated: recordRestaurantCreated,
  completeByRestaurantId: completeByRestaurantId,
};
