import { VetConsultation } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import Farm from '../Models/Farm';
import WeatherData from '../Models/WeatherData';
import { Types } from 'mongoose';
import { IVetConsultation } from '../Types/livestock.types';
import { livestockHealthService } from './livestock-health.service';
import { consultWithImages, chatWithContext } from '../Utils/geminiClient';
import cloudinary from '../Config/cloudinary';
import logger from '../Utils/logger';

const VET_SYSTEM_PROMPT = `You are AgroGuardian AI's expert veterinary consultant - a friendly, knowledgeable livestock health advisor available 24/7.

**Your Expertise:**
- All common livestock: cattle, goats, sheep, pigs, poultry, fish, rabbits
- Disease diagnosis and treatment
- Nutrition and feeding guidance
- Breeding and reproduction
- Preventive care and vaccination schedules
- Parasite control
- Housing and welfare
- Emergency first aid

**Context:**
{context}

**Guidelines:**
1. Provide practical, actionable advice suitable for farmers
2. Consider local conditions, resources, and climate
3. Prioritize animal welfare in all recommendations
4. Recommend professional veterinary care when appropriate
5. Be specific with dosages, timing, and procedures when safe
6. Explain the reasoning behind your recommendations
7. Alert to warning signs requiring immediate attention
8. Consider cost-effective solutions for smallholder farmers
9. Use local units (₦ for costs in Nigeria)

**Response Style:**
- Warm and supportive tone
- Clear, jargon-free language
- Step-by-step instructions when needed
- Include safety precautions for medications
- Ask clarifying questions if needed

If you identify a potentially serious condition, recommend immediate veterinary attention and provide first aid steps while waiting for professional help.`;

export class VetConsultationService {
  /**
   * Start a new consultation
   */
  async startConsultation(data: {
    farmId: string;
    userId: string;
    livestockId?: string;
    species: string;
    initialMessage: string;
    imageBuffers?: Buffer[];
  }): Promise<IVetConsultation> {
    // Upload images if provided
    let imageUrls: string[] = [];
    if (data.imageBuffers && data.imageBuffers.length > 0) {
      const uploadResults = await Promise.all(
        data.imageBuffers.map((buffer) =>
          new Promise<{ secure_url: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'agroguardian/vet-consultations', resource_type: 'image' },
              (error, result) => {
                if (error || !result) return reject(error || new Error('Upload failed'));
                resolve(result);
              }
            );
            stream.end(buffer);
          })
        )
      );
      imageUrls = uploadResults.map(r => r.secure_url);
    }

    // Build context
    const context = await this.buildContext(data.farmId, data.livestockId, data.species);

    // Get AI response
    const systemPrompt = VET_SYSTEM_PROMPT.replace('{context}', context);
    
    let aiResponse: string;
    if (imageUrls.length > 0) {
      const result = await consultWithImages(
        data.initialMessage,
        imageUrls,
        [],
        {
          cropName: data.species, // Reusing crop consultation for now
          farmLocation: context
        }
      );
      aiResponse = result.response;
    } else {
      aiResponse = await chatWithContext(data.initialMessage, [], systemPrompt);
    }

    // Create consultation
    const consultation = await VetConsultation.create({
      farmId: new Types.ObjectId(data.farmId),
      userId: new Types.ObjectId(data.userId),
      livestockId: data.livestockId ? new Types.ObjectId(data.livestockId) : undefined,
      species: data.species,
      status: 'active',
      messages: [
        {
          role: 'user',
          content: data.initialMessage,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          timestamp: new Date()
        },
        {
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date()
        }
      ]
    });

    logger.info(`Vet consultation started: ${consultation._id}`);
    return consultation;
  }

  /**
   * Send a message in an existing consultation
   */
  async sendMessage(
    consultationId: string,
    userId: string,
    message: string,
    imageBuffers?: Buffer[]
  ): Promise<{ consultation: IVetConsultation; aiResponse: string }> {
    const consultation = await VetConsultation.findOne({
      _id: consultationId,
      userId: new Types.ObjectId(userId)
    });

    if (!consultation) {
      throw new Error('Consultation not found');
    }

    // Upload images if provided
    let imageUrls: string[] = [];
    if (imageBuffers && imageBuffers.length > 0) {
      const uploadResults = await Promise.all(
        imageBuffers.map((buffer) =>
          new Promise<{ secure_url: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'agroguardian/vet-consultations', resource_type: 'image' },
              (error, result) => {
                if (error || !result) return reject(error || new Error('Upload failed'));
                resolve(result);
              }
            );
            stream.end(buffer);
          })
        )
      );
      imageUrls = uploadResults.map(r => r.secure_url);
    }

    // Build context
    const context = await this.buildContext(
      consultation.farmId.toString(),
      consultation.livestockId?.toString(),
      consultation.species
    );

    // Build chat history
    const chatHistory = consultation.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      imageUrls: msg.imageUrls
    }));

    // Get AI response
    const systemPrompt = VET_SYSTEM_PROMPT.replace('{context}', context);
    
    let aiResponse: string;
    if (imageUrls.length > 0) {
      const result = await consultWithImages(
        message,
        imageUrls,
        chatHistory,
        {
          cropName: consultation.species,
          farmLocation: context
        }
      );
      aiResponse = result.response;
    } else {
      aiResponse = await chatWithContext(message, chatHistory, systemPrompt);
    }

    // Add messages
    consultation.messages.push(
      {
        role: 'user',
        content: message,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      }
    );

    await consultation.save();

    return { consultation, aiResponse };
  }

  /**
   * Get consultation by ID
   */
  async getConsultation(consultationId: string, userId: string): Promise<IVetConsultation | null> {
    return VetConsultation.findOne({
      _id: consultationId,
      userId: new Types.ObjectId(userId)
    }).populate('livestockId', 'name tagId species breed healthStatus');
  }

  /**
   * Get all consultations for a farm
   */
  async getConsultations(farmId: string, options: {
    status?: string;
    livestockId?: string;
    limit?: number;
  } = {}): Promise<IVetConsultation[]> {
    const query: any = { farmId: new Types.ObjectId(farmId) };
    
    if (options.status) query.status = options.status;
    if (options.livestockId) query.livestockId = new Types.ObjectId(options.livestockId);

    return VetConsultation.find(query)
      .populate('livestockId', 'name tagId species breed')
      .sort({ updatedAt: -1 })
      .limit(options.limit || 50);
  }

  /**
   * Update consultation (resolve, archive, add summary)
   */
  async updateConsultation(
    consultationId: string,
    userId: string,
    data: Partial<Pick<IVetConsultation, 'status' | 'title' | 'summary' | 'issueType' | 'severity'>>
  ): Promise<IVetConsultation | null> {
    return VetConsultation.findOneAndUpdate(
      { _id: consultationId, userId: new Types.ObjectId(userId) },
      { $set: data },
      { new: true }
    );
  }

  /**
   * Delete consultation
   */
  async deleteConsultation(consultationId: string, userId: string): Promise<boolean> {
    const result = await VetConsultation.findOneAndDelete({
      _id: consultationId,
      userId: new Types.ObjectId(userId)
    });
    return !!result;
  }

  /**
   * Build context string for AI
   */
  private async buildContext(farmId: string, livestockId?: string, species?: string): Promise<string> {
    const contextParts: string[] = [];

    // Get farm info
    const farm = await Farm.findById(farmId);
    if (farm) {
      contextParts.push(`Farm: ${farm.name}`);
      if (farm.location) {
        contextParts.push(`Location: ${farm.location.city}, ${farm.location.country}`);
      }
    }

    // Get weather
    const weather = await WeatherData.findOne({ farmId: new Types.ObjectId(farmId) }).sort({ timestamp: -1 });
    if (weather?.current) {
      contextParts.push(`Weather: ${weather.current.weatherDescription}, ${weather.current.temperature}°C, ${weather.current.humidity}% humidity`);
    }

    // Get livestock info if specific animal
    if (livestockId) {
      const livestock = await Livestock.findById(livestockId);
      if (livestock) {
        contextParts.push(`Animal: ${livestock.name || livestock.tagId || 'Unknown'}`);
        contextParts.push(`Species: ${livestock.species}, Breed: ${livestock.breed || 'Unknown'}`);
        contextParts.push(`Health Status: ${livestock.healthStatus}`);
        if (livestock.weight) contextParts.push(`Weight: ${livestock.weight}kg`);
        if (livestock.dateOfBirth) {
          const ageMs = Date.now() - new Date(livestock.dateOfBirth).getTime();
          const years = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
          const months = Math.floor((ageMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
          contextParts.push(`Age: ${years > 0 ? `${years}y ${months}m` : `${months} months`}`);
        }

        // Get recent health records
        try {
          const healthRecords = await livestockHealthService.getAllHealthRecords(livestockId);
          if (healthRecords.vaccinations.length > 0) {
            contextParts.push(`Recent vaccinations: ${healthRecords.vaccinations.slice(0, 3).map(v => v.vaccineName).join(', ')}`);
          }
          if (healthRecords.treatments.length > 0) {
            const activeTreatments = healthRecords.treatments.filter(t => t.status === 'ongoing');
            if (activeTreatments.length > 0) {
              contextParts.push(`Active treatments: ${activeTreatments.map(t => t.condition).join(', ')}`);
            }
          }
          if (healthRecords.illnesses.length > 0) {
            const activeIllnesses = healthRecords.illnesses.filter(i => i.status !== 'resolved');
            if (activeIllnesses.length > 0) {
              contextParts.push(`Current illnesses: ${activeIllnesses.map(i => i.condition).join(', ')}`);
            }
          }
        } catch (e) {
          // Health records may not exist
        }
      }
    } else if (species) {
      contextParts.push(`Species: ${species}`);
    }

    return contextParts.join('\n');
  }
}

export const vetConsultationService = new VetConsultationService();
