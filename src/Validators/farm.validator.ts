import {z} from "zod";

export const createFarmSchema = z.object({
    name: z.string("Farm name is required")
    .min(2, "Farm name must be at least 2 characters")
    .max(100, "Farm name must not exceed 100 characters"),

    size: z.coerce.number({ error: "Farm size is required" })
    .positive("Farm size must be a positive number"),

    sizeUnit: z.enum(["acres", "hectares"]),

    location: z.object({
        address: z.string({ error: "Address is required" }),
        city: z.string({ error: "City is required" }),
        state: z.string({ error: "State is required" }),
        country: z.string({ error: "Country is required" }),
        coordinates: z.object({
            latitude: z.coerce.number({ error: "Latitude must be a number" })
            .min(-90)
            .max(90),
            longitude: z.coerce.number({ error: "Longitude must be a number" })
            .min(-180)
            .max(180),
        }).optional() 
    }),

    imageUrl: z.array(z.string().url("Each image URL must be valid"))
    .optional(),
    
    description: z.string()
    .max(500, "Description must not exceed 500 characters").optional(),

    status: z.enum(["active", "inactive", "fallow"]).optional(),
    
    irrigationType: z.enum(["drip", "sprinkler", "flood", "rainfed", "none"]),

    soilType: z.array(z.enum(["clay", "sandy", "loamy", "silty", "peaty", "laterite", "clay-loam", "sandy-loam"])).min(1, "At least one soil type is required"),

    establishedDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Established date must be a valid date string",
    }).optional(),
});

export const  updateFarmSchema = createFarmSchema.partial();

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;