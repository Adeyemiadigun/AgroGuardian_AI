import  mongoose, { Schema } from "mongoose";
import { IFarm } from "../Types/farm.types";

const farmSchema = new Schema<IFarm>(
    {
        owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
        name: { type: String, required: true , trim: true},
        size: { type: Number, required: true },
        sizeUnit: { type: String, enum: ["acres", "hectares"], required: true },
        crops: [{ type: String }],
        location: {
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            coordinates: {
                latitude: { type: Number, required: true },
                longitude: { type: Number, required: true }
            }
        },
        imageUrl: [{ type: String }],
        description: { type: String },
        status: { type: String, enum: ["active", "inactive", "fallow"], default:"active" },
        irrigationType: { type: String, enum:["drip", "sprinkler", "flood", "rainfed", "none"] , required: true},
        soilType: { type: String, enum:["clay", "sandy", "loamy", "silty", "peaty", "laterite", "clay-loam", "sandy-loam"], required: true },
        establishedDate:{ type : Date }
    },{
        timestamps: true   
    }
)
farmSchema.index({owner: 1})

export default mongoose.model<IFarm>("Farm", farmSchema);