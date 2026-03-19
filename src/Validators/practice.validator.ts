import { z } from "zod";

export const createCropSeasonSchema = z.object({
  cropId: z.string({ required_error: "Crop ID is required" }),
  plantedDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Planted date must be a valid date string",
  }).optional(),
  area: z.number({ required_error: "Area is required" }).positive(),
  areaUnit: z.enum(["acres", "hectares"]).optional(),
});

export const logPracticeActivitySchema = z.object({
  farmId: z.string({ required_error: "Farm ID is required" }),
  practiceId: z.string({ required_error: "Practice ID is required" }),
  cropId: z.string({ required_error: "Crop ID is required" }),
  cropSeasonId: z.string().optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Start date must be a valid date string",
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "End date must be a valid date string",
  }),
  size: z.number({ required_error: "Activity area size is required" }).positive(),
  sizeUnit: z.enum(["acres", "hectares"]).optional(),
  notes: z.string().max(500, "Notes must not exceed 500 characters").optional(),
});

export const generateCreditsSchema = z.object({
  farmId: z.string({ required_error: "Farm ID is required" }),
  periodStart: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Period start must be a valid date string",
  }),
  periodEnd: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Period end must be a valid date string",
  }),
});

export type CreateCropSeasonInput = z.infer<typeof createCropSeasonSchema>;
export type LogPracticeActivityInput = z.infer<typeof logPracticeActivitySchema>;
export type GenerateCreditsInput = z.infer<typeof generateCreditsSchema>;
