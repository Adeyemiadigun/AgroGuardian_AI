import mongoose from "mongoose";
import logger from "../Utils/logger";

export const connectDB = async () => {
    try{
        const conn = await mongoose.connect(process.env.MONGO_URI || "");
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
};