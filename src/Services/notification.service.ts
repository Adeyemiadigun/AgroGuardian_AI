import Notification, { INotification } from "../Models/Notification";
import logger from "../Utils/logger";

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: INotification["type"],
  link?: string
) => {
  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      link,
    });
    logger.info(`Notification created for user ${userId}: ${title}`);
    return notification;
  } catch (error: any) {
    logger.error(`Error creating notification: ${error.message}`);
    throw error;
  }
};

export const getUserNotifications = async (userId: string) => {
  return await Notification.find({ userId }).sort({ createdAt: -1 }).limit(20);
};

export const markAsRead = async (notificationId: string, userId: string) => {
  return await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { status: "read" },
    { new: true }
  );
};

export const markAllAsRead = async (userId: string) => {
  return await Notification.updateMany(
    { userId, status: "unread" },
    { status: "read" }
  );
};
