import Evidence from "../Models/Evidence";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import FarmPractice from "../Models/FarmPractice";
import Farm from "../Models/Farm";
import CropSeason from "../Models/CropSeason";
import { verifyPracticeImage, comparePracticeImages } from "../Utils/openaiClient";
import logger from "../Utils/logger";
import { calculateCarbonForActivity } from "./carbon.service";
import { backfillAccrualForPracticeLog } from "./carbon-accrual.service";
// import * as ExifParser from "exif-parser"; // Commented out for later implementation

/**
 * Strict Verification Service
 * Handles metadata extraction, GPS validation, and AI-powered visual audits
 */

export const verifyActivityEvidence = async (evidenceId: string, imageBuffer: Buffer) => {
  try {
    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) throw new Error("Evidence not found");

    const log = await PracticeActivityLog.findById(evidence.practiceLogId);
    if (!log) throw new Error("Activity log not found");

    const practice = await FarmPractice.findById(log.practiceId);
    if (!practice) throw new Error("Practice not found");

    const farm = await Farm.findById(log.farmId);
    if (!farm) throw new Error("Farm not found");

    /* 1. EXTRACT EXIF METADATA (Commented out for later implementation)
    try {
      const parser = ExifParser.create(imageBuffer);
      const result = parser.parse();
      ...
      
      if (result.tags) {
        const exifData: any = {
          cameraModel: result.tags.Model,
          takenAt: result.tags.DateTimeOriginal ? new Date(result.tags.DateTimeOriginal * 1000) : undefined,
        };

        if (result.tags.GPSLatitude && result.tags.GPSLongitude) {
          exifData.latitude = result.tags.GPSLatitude;
          exifData.longitude = result.tags.GPSLongitude;
        }

        evidence.exifData = exifData;
        await evidence.save();

        // 2. STRICT VALIDATION: GPS Geofencing
        if (exifData.latitude && exifData.longitude) {
          const farmLat = farm.location.coordinates.latitude;
          const farmLng = farm.location.coordinates.longitude;
          
          const distance = calculateDistance(exifData.latitude, exifData.longitude, farmLat, farmLng);
          
          if (distance > 0.5) { // 500 meters threshold
            const flag = `GPS_MISMATCH: Photo taken ${distance.toFixed(2)}km from farm center`;
            if (!log.verificationFlags.includes(flag)) {
              log.verificationFlags.push(flag);
              await log.save();
              logger.warn(`STRICT_FAIL: ${flag} for activity ${log._id}`);
            }
          }
        } else {
            log.verificationFlags.push("MISSING_GPS: Image has no location metadata");
            await log.save();
        }

        // 3. STRICT VALIDATION: Timestamp Check
        if (exifData.takenAt) {
          const now = new Date();
          const diffMinutes = Math.abs(now.getTime() - exifData.takenAt.getTime()) / (1000 * 60);
          
          if (diffMinutes > 60) { // 1 hour threshold for 'live' photo
            const flag = `TIMESTAMP_MISMATCH: Photo taken at ${exifData.takenAt.toISOString()}, uploaded at ${now.toISOString()}`;
            if (!log.verificationFlags.includes(flag)) {
              log.verificationFlags.push(flag);
              await log.save();
            }
          }
        }
      }
    } catch (exifErr) {
      logger.error("EXIF Parsing failed:", exifErr);
    }
    */

    // 4. AI VISUAL VERIFICATION
    let aiResult;
    if (evidence.evidenceType === "start") {
      // Single image verification for start
      aiResult = await verifyPracticeImage(imageBuffer.toString('base64'), practice.name);
      
      evidence.description = `${evidence.description || ""}\n\nAI Start Verification: ${aiResult.isVerified ? "PASSED" : "FAILED"} (${aiResult.confidence}%)\nReasoning: ${aiResult.reasoning}`;
      
      if (aiResult.isVerified && aiResult.confidence >= 80) {
        log.status = "active"; // Move from pending_start to active
        await log.save();
      } else {
          log.status = "failed";
          log.verificationFlags.push(`AI_START_FAIL: ${aiResult.reasoning}`);
          await log.save();
      }
    } else {
      // END EVIDENCE: Comparative Analysis
      const startEvidence = await Evidence.findById(log.startEvidenceId);
      if (startEvidence) {
        aiResult = await comparePracticeImages(
          startEvidence.imageUrl, 
          evidence.imageUrl, 
          practice.name
        );
        
        evidence.description = `${evidence.description || ""}\n\nAI End-to-End Verification: ${aiResult.isVerified ? "PASSED" : "FAILED"} (${aiResult.confidence}%)\nLandmark Match: ${aiResult.landmarkMatch ? "YES" : "NO"}\nObservations: ${aiResult.observations}`;
        
        if (aiResult.isVerified && aiResult.confidence >= 80 && aiResult.landmarkMatch) {
          log.status = "completed";
          await log.save();
          
          // Automate Season Harvest: If this was a "Harvesting" practice, mark the linked season as harvested
          if (practice.name.toLowerCase() === "harvesting" && log.cropSeasonId) {
            await CropSeason.findByIdAndUpdate(log.cropSeasonId, {
              status: "harvested",
              harvestDate: new Date()
            });
            logger.info(`AUTO_SEASON_SETTLEMENT: Season ${log.cropSeasonId} marked as harvested via completion of Harvesting practice.`);
          }
          
          // Store a final audit calculation, then mark all monthly accrual credits as verified.
          await calculateCarbonForActivity(log._id.toString());

          await backfillAccrualForPracticeLog(log._id.toString(), {
            targetStatus: "verified",
            isEstimated: false,
          });

          logger.info(`STRICT_SUCCESS: Activity ${log._id} verified and accrual credits verified.`);
        } else {
            log.status = "failed";
            log.verificationFlags.push(`AI_END_FAIL: ${aiResult.reasoning || aiResult.observations}`);
            await log.save();
        }
      }
    }

    await evidence.save();
    return aiResult;
  } catch (error: any) {
    logger.error("Strict Verification error:", error);
    throw error;
  }
};

/**
 * Haversine formula to calculate distance between two coordinates in km
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
