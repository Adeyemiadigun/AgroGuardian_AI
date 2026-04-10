import FarmPractice from "../Models/FarmPractice";

export const seedDatabase = async () => {
  const DEFAULT_PRACTICES = [
    { name: "Cover Cropping", category: "soil", description: "Planting non-commodity crops like legumes or grasses to protect and enrich the soil between main crop seasons." },
    { name: "Organic Mulching", category: "soil", description: "Applying organic materials (straw, leaves, compost) to the soil surface to retain moisture and suppress weeds." },
    { name: "Drip Irrigation", category: "water", description: "Highly efficient water delivery system that provides moisture directly to the root zone, reducing evaporation." },
    { name: "Agroforestry Integration", category: "agroforestry", description: "Strategic planting of trees and shrubs within agricultural landscapes to enhance biodiversity and carbon storage." },
    { name: "Leguminous Crop Rotation", category: "crop", description: "Sequencing different crops over time, specifically including nitrogen-fixing legumes to maintain soil health." },
    { name: "Zero-Tillage Planting", category: "soil", description: "Sowing seeds directly into undisturbed soil to preserve soil structure and maximize carbon sequestration." },
    { name: "Rainwater Harvesting", category: "water", description: "Collection and storage of rainwater for agricultural use during dry spells to maintain crop resilience." },
    { name: "Mulching", category: "soil", description: "Applying a layer of material on the soil surface to retain moisture, suppress weeds, and improve soil health." }
  ];

  const results = [];
  for (const practice of DEFAULT_PRACTICES) {
    const p = await FarmPractice.findOneAndUpdate(
      { name: practice.name }, // Unique by name
      practice,
      { upsert: true, new: true }
    );
    results.push(p);
  }
  return results;
};
