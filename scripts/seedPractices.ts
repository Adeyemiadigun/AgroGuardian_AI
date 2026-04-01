import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import FarmPractice from "../src/Models/FarmPractice";

// Force Google DNS for SRV resolution (fixes ECONNREFUSED on some networks)
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

const DEFAULT_PRACTICES = [
  {
    name: "Cover Cropping",
    category: "soil",
    description: "Planting non-commodity crops like legumes or grasses to protect and enrich the soil between main crop seasons."
  },
  {
    name: "Organic Mulching",
    category: "soil",
    description: "Applying organic materials (straw, leaves, compost) to the soil surface to retain moisture and suppress weeds."
  },
  {
    name: "Drip Irrigation",
    category: "water",
    description: "Highly efficient water delivery system that provides moisture directly to the root zone, reducing evaporation."
  },
  {
    name: "Agroforestry Integration",
    category: "agroforestry",
    description: "Strategic planting of trees and shrubs within agricultural landscapes to enhance biodiversity and carbon storage."
  },
  {
    name: "Leguminous Crop Rotation",
    category: "crop",
    description: "Sequencing different crops over time, specifically including nitrogen-fixing legumes to maintain soil health."
  },
  {
    name: "Zero-Tillage Planting",
    category: "soil",
    description: "Sowing seeds directly into undisturbed soil to preserve soil structure and maximize carbon sequestration."
  },
  {
    name: "Rainwater Harvesting",
    category: "water",
    description: "Collection and storage of rainwater for agricultural use during dry spells to maintain crop resilience."
  },
  {
    name: "Mulching",
    category: "soil",
    description: "Applying a layer of material on the soil surface to retain moisture, suppress weeds, and improve soil health."
  }
];

const seedPractices = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI not found in .env file");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");
    console.log(`Active Database: ${mongoose.connection.name}`);
    console.log(`Target Collection: ${FarmPractice.collection.name}`);

    console.log("Cleaning up existing practices (optional)...");
    // Only delete if you want to replace everything
    // await FarmPractice.deleteMany({});

    console.log("Seeding default practices...");
    for (const practice of DEFAULT_PRACTICES) {
      await FarmPractice.findOneAndUpdate(
        { name: practice.name }, // Unique by name
        practice,
        { upsert: true, new: true }
      );
    }

    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedPractices();
