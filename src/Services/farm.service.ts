import Farm from "../Models/Farm";
import logger from "../Utils/logger";
import { IFarm } from "../Types/farm.types";
import {CreateFarmInput, UpdateFarmInput} from "../Validators/farm.validator";

export const createFarm = async (data: CreateFarmInput, ownerId: string) => {
    const { name, size, sizeUnit, crops, location:{
        address, city, state, country, coordinates:{latitude, longitude}}, 
        imageUrl, description, status, irrigationType, soilType, establishedDate
    } = data;

    const existingFarm = await Farm.findOne({ name: name.trim(), owner: ownerId });
    if(existingFarm){
        logger.error(`Farm creation failed: Farm with name "${name}" already exists for this user.`);
        throw new Error("Farm with this name already exists for this user");
    }

    const farm = await Farm.create({
        owner: ownerId,
        name: name.trim(),
        size: size,
        sizeUnit: sizeUnit,
        crops: crops,
        location: {
            address: address,
            city: city,
            state: state,
            country: country,
            coordinates: {
                latitude: latitude,
                longitude: longitude
            }
        },
        imageUrl: imageUrl,
        description: description,
        status: status,
        irrigationType: irrigationType,
        soilType: soilType,
        establishedDate: establishedDate
    });

    logger.info(`Farm created: ${name} by user ${ownerId}`);

    return{
        id: farm._id
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