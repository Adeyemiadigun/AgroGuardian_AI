import Evidence from "../Models/Evidence";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import FarmPractice from "../Models/FarmPractice";
import { verifyPracticeImage } from "../Utils/openaiClient";
import logger from "../Utils/logger";
import axios from "axios";

export const verifyActivityEvidence = async (evidenceId: string) => {
  try {
    const evidence = await Evidence.findById(evidenceId);
    if (!evidence) throw new Error("Evidence not found");

    const log = await PracticeActivityLog.findById(evidence.practiceLogId);
    if (!log) throw new Error("Activity log not found");

    const practice = await FarmPractice.findById(log.practiceId);
    if (!practice) throw new Error("Practice not found");

    // 1. Download image and convert to base64
    const response = await axios.get(evidence.imageUrl, { responseType: 'arraybuffer' });
    const imageBase64 = Buffer.from(response.data as any, 'binary').toString('base64');

    // 2. Call AI Verification
    const aiResult = await verifyPracticeImage(imageBase64, practice.name);

    // 3. Update Evidence with AI results
    evidence.description = `${evidence.description || ""}

AI Verification: ${aiResult.isVerified ? "PASSED" : "FAILED"} (${aiResult.confidence}% confidence)
Observations: ${aiResult.observations}
Reasoning: ${aiResult.reasoning}`;
    await evidence.save();

    logger.info(`AI Verification completed for evidence ${evidenceId}: ${aiResult.isVerified ? "Success" : "Failure"}`);

    return aiResult;
  } catch (error: any) {
    logger.error("Verification error:", error);
    throw error;
  }
};
