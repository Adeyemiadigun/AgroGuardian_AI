import { z } from "zod";

export const cropDiagnosisSchema = z.object({
  farmId: z
    .string("Farm ID is required")
    .length(24, { message: "Farm ID must be a valid MongoDB ObjectId" }),

  cropType: z
    .string("Crop type is required")
    .min(2, { message: "Crop type must be at least 2 characters" })
    .max(50, { message: "Crop type must not exceed 50 characters" }),
});

export const diagnosisChatSchema = z.object({
  message: z
    .string("Message is required")
    .min(1, { message: "Message cannot be empty" })
    .max(1000, { message: "Message must not exceed 1000 characters" }),
});

export const updateDiagnosisStatusSchema = z.object({
  status: z.enum(["detected", "treating", "resolved"], {
    message: "Invalid status value",
  }),
});

export type CropDiagnosisInput = z.infer<typeof cropDiagnosisSchema>;
export type DiagnosisChatInput = z.infer<typeof diagnosisChatSchema>;
export type UpdateDiagnosisStatusInput = z.infer<typeof updateDiagnosisStatusSchema>;