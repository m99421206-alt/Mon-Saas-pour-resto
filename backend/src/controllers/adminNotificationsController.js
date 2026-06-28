/**
 * API admin — notifications plateforme.
 */

const {
  listNotifications,
  getUnreadCount,
  listRecentNotifications,
  getNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  isMissingTableError,
} = require("../services/adminNotificationService");

async function getNotifications(req, res) {
  try {
    var result = await listNotifications({
      page: req.query.page,
      pageSize: req.query.pageSize,
      filter: req.query.filter,
    });
    var unread = await getUnreadCount();
    return res.json({
      notifications: result.notifications,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      filter: result.filter,
      unread_count: unread,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({
        notifications: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        filter: "all",
        unread_count: 0,
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les notifications." });
  }
}

async function getRecentNotifications(req, res) {
  try {
    var limit = Number(req.query.limit) || 8;
    var items = await listRecentNotifications(limit);
    var unread = await getUnreadCount();
    return res.json({
      notifications: items,
      unread_count: unread,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({ notifications: [], unread_count: 0 });
    }
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les notifications." });
  }
}

async function getUnreadCountHandler(req, res) {
  try {
    var count = await getUnreadCount();
    return res.json({ unread_count: count });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({ unread_count: 0 });
    }
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function getNotificationDetail(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }
    var item = await getNotificationById(id);
    if (!item) {
      return res.status(404).json({ message: "Notification introuvable." });
    }
    return res.json({ notification: item });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.status(404).json({ message: "Notification introuvable." });
    }
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function patchNotificationRead(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }
    var ok = await markNotificationRead(id);
    if (!ok) {
      return res.status(404).json({ message: "Notification introuvable." });
    }
    var unread = await getUnreadCount();
    return res.json({ ok: true, id: id, is_read: true, unread_count: unread });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postMarkAllRead(req, res) {
  try {
    var updated = await markAllNotificationsRead();
    return res.json({ ok: true, updated: updated, unread_count: 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteNotificationHandler(req, res) {
  try {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }
    var ok = await deleteNotification(id);
    if (!ok) {
      return res.status(404).json({ message: "Notification introuvable." });
    }
    var unread = await getUnreadCount();
    return res.json({ ok: true, unread_count: unread });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getNotifications: getNotifications,
  getRecentNotifications: getRecentNotifications,
  getNotificationDetail: getNotificationDetail,
  getUnreadCountHandler: getUnreadCountHandler,
  patchNotificationRead: patchNotificationRead,
  postMarkAllRead: postMarkAllRead,
  deleteNotificationHandler: deleteNotificationHandler,
};
