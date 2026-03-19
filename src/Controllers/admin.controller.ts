import { Request, Response } from "express";
import { seedDatabase } from "../Services/seed.service";
import logger from "../Utils/logger";

export const seedController = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await seedDatabase();
    logger.info("Database seeded successfully", result);
    res.status(200).json({
      success: true,
      message: "Database seeded successfully",
      data: result,
    });
  } catch (error: any) {
    logger.error("Seeding error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Seeding failed",
    });
  }
};
