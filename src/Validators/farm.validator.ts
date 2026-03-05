import {z} from "zod";

export const createFarmSchema = z.object({
    name: z.string("Farm name is required")
    .min(2, "Farm name must be at least 2 characters")
    .max(100, "Farm name must not exceed 100 characters"),

    size: z.number("Farm size is required")
    .positive("Farm size must be a positive number"),

    sizeUnit: z.enum(["acres", "hectares"]),

    crops: z.array(z.string("Each crop is required"))
    .min(1, "At least one crop is required"),

    location: z.object({
        address: z.string("Address is required"),
        city: z.string("City is required"),
        state: z.string("State is required"),
        country: z.string("Country is required"),
        coordinates: z.object({
            latitude: z.number("Latitude is required")
            .min(-90, "Latitude must be between -90 and 90")
            .max(90, "Latitude must be between -90 and 90"),
            longitude: z.number("Longitude is required")
            .min(-180, "Longitude must be between -180 and 180")
            .max(180, "Longitude must be between -180 and 180"),
        })
    }),

    imageUrl: z.array(z.string().url("Each image URL must be valid"))
    .optional(),
    
    description: z.string()
    .max(500, "Description must not exceed 500 characters").optional(),

    status: z.enum(["active", "inactive", "fallow"]).optional(),
    
    irrigationType: z.enum(["drip", "sprinkler", "flood", "rainfed", "none"]),

    soilType: z.enum(["clay", "sandy", "loamy", "silty", "peaty", "laterite", "clay-loam", "sandy-loam"]),

    establishedDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Established date must be a valid date string",
    }).optional(),
});

export const  updateFarmSchema = createFarmSchema.partial();

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;