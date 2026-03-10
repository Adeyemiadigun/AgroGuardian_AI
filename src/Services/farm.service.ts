import Farm from "../Models/Farm";
import logger from "../Utils/logger";
import {CreateFarmInput, UpdateFarmInput} from "../Validators/farm.validator";
import cloudinary from "../Config/cloudinary";
import axios from "axios";

const WEATHER_API_KEY = process.env.WEATHER_API_KEY || "YOUR_OPENWEATHER_API_KEY";

const getCoordinatesFromAddress = async (location: CreateFarmInput["location"]): Promise<{ lat: number, lon: number }> => {
    try {
        const query = `${location.address}, ${location.city}, ${location.state}, ${location.country}`;
        const response = await axios.get(`http://api.openweathermap.org/geo/1.0/direct`, {
            params: {
                q: query,
                limit: 1,
                appid: WEATHER_API_KEY
            }
        });

        const data = response.data as any[];

        if (!data || data.length === 0) {
            const fallbackQuery = `${location.city}, ${location.country}`;
            const fallbackResponse = await axios.get(`http://api.openweathermap.org/geo/1.0/direct`, {
                params: {
                    q: fallbackQuery,
                    limit: 1,
                    appid: WEATHER_API_KEY
                }
            });

            const fallbackData = fallbackResponse.data as any[];

            if (!fallbackData || fallbackData.length === 0) {
                throw new Error("Could not find coordinates for this location. Please check the city and country.");
            }
            return { lat: fallbackData[0].lat, lon: fallbackData[0].lon };
        }

        return { lat: data[0].lat, lon: data[0].lon };
    } catch (error: any) {
        logger.error(`Geocoding error: ${error.message}`);
        throw new Error(`Failed to resolve farm location: ${error.message}`);
    }
}

export const createFarm = async (data: CreateFarmInput, ownerId: string, imageBuffer?: Buffer) => {
    const { name, size, sizeUnit, crops, location, imageUrl: providedImageUrls, description, status, irrigationType, soilType, establishedDate } = data;

    const existingFarm = await Farm.findOne({ name: name.trim(), owner: ownerId });
    if(existingFarm){
        logger.error(`Farm creation failed: Farm with name "${name}" already exists for this user.`);
        throw new Error("Farm with this name already exists for this user");
    }

    let finalLatitude = location.coordinates?.latitude;
    let finalLongitude = location.coordinates?.longitude;

    if (!finalLatitude || !finalLongitude) {
        logger.info(`Coordinates not provided for ${name}. Attempting to geocode...`);
        const { lat, lon } = await getCoordinatesFromAddress(location);
        finalLatitude = lat;
        finalLongitude = lon;
        logger.info(`Geocoded coordinates for ${name}: ${lat}, ${lon}`);
    }

    let finalImageUrls = providedImageUrls || [];

    if (imageBuffer) {
        const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "agroguardian/farms", resource_type: "image" },
                (error, result) => {
                    if (error || !result) return reject(error || new Error("Upload failed"));
                    resolve(result);
                }
            );
            stream.end(imageBuffer);
        });
        finalImageUrls.push(uploadResult.secure_url);
    }

    const farm = await Farm.create({
        owner: ownerId,
        name: name.trim(),
        size: size,
        sizeUnit: sizeUnit,
        crops: crops,
        location: {
            address: location.address,
            city: location.city,
            state: location.state,
            country: location.country,
            coordinates: {
                latitude: finalLatitude,
                longitude: finalLongitude
            }
        },
        imageUrl: finalImageUrls,
        description: description,
        status: status,
        irrigationType: irrigationType,
        soilType: soilType,
        establishedDate: establishedDate
    });

    logger.info(`Farm created: ${name} by user ${ownerId}`);

    return {
        id: farm._id,
        location: farm.location,
        imageUrl: farm.imageUrl
    }
}

export const getFarmsByOwner = async (ownerId: string) => {
    const farms = await Farm.find({ owner: ownerId });
    logger.info(`Farms retrieved for user ${ownerId}: ${farms.length} farm(s) found.`);
    return farms;
}

export const getFarmById = async (farmId: string, ownerId: string) => {
    const farm = await Farm.findOne({ _id: farmId, owner: ownerId });
    if(!farm){
        logger.warn(`Farm not found: Farm ID ${farmId} for user ${ownerId}`);
        throw new Error("Farm not found");
    }
    logger.info(`Farm retrieved: ${farm.name} for user ${ownerId}`);
    return farm;
}

export const updateFarm = async (farmId: string, ownerId: string, data: UpdateFarmInput) => {
    const farm = await Farm.findOneAndUpdate(
        { _id: farmId, owner: ownerId },
        { ...data },
        { new: true }
    );
    if(!farm){
        logger.warn(`Farm not found: Farm ID ${farmId} for user ${ownerId}`);
        throw new Error("Farm not found");
    }
    logger.info(`Farm updated: ${farm.name} for user ${ownerId}`);
    return farm;
}

export const deleteFarm = async (farmId: string, ownerId: string) => {
    const farm = await Farm.findOneAndDelete({ _id: farmId, owner: ownerId });
    if(!farm){
        logger.warn(`Farm not found for deletion: Farm ID ${farmId} for user ${ownerId}`);
        throw new Error("Farm not found");
    }
    logger.info(`Farm deleted: ${farm.name} for user ${ownerId}`);
    return { message: "Farm deleted successfully" };
}
