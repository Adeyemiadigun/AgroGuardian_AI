import { Router } from "express";
import { authenticate } from "../Middlewares/auth.middleware";
import { getUserNotifications, markAsRead, markAllAsRead } from "../Services/notification.service";

const router = Router();

router.get("/", authenticate as any, async (req: any, res) => {
  const notifications = await getUserNotifications(req.user.userId);
  res.status(200).json({ success: true, data: notifications });
});

router.patch("/:notificationId/read", authenticate as any, async (req: any, res) => {
  const notification = await markAsRead(req.params.notificationId, req.user.userId);
  res.status(200).json({ success: true, data: notification });
});

router.patch("/read-all", authenticate as any, async (req: any, res) => {
  await markAllAsRead(req.user.userId);
  res.status(200).json({ success: true, message: "All notifications marked as read" });
});

export default router;
