import { LivestockDiagnosis } from '../Models/LivestockHealth';
import Livestock from '../Models/Livestock';
import Farm from '../Models/Farm';
import User from '../Models/User';
import WeatherData from '../Models/WeatherData';
import cloudinary from '../Config/cloudinary';
import logger from '../Utils/logger';
import { createNotification } from './notification.service';
import { sendBrevoEmail } from './email.service';
import { livestockHealthService } from './livestock-health.service';
import { Types } from 'mongoose';
import { analyzeImageWithGemini, chatWithContext } from '../Utils/geminiClient';
import { addLivestockDiagnosisJob } from '../Queues/livestockDiagnosis.queue';

/**
 * Livestock Health Diagnosis Service
 * Uses AI to analyze images of livestock and provide health assessments
 */

// AI Prompt for livestock health analysis
const LIVESTOCK_DIAGNOSIS_PROMPT = `You are an expert veterinarian AI assistant specializing in livestock health assessment. Analyze the provided image(s) of the animal and provide a comprehensive health diagnosis.

**Animal Information:**
- Species: {species}
- Breed: {breed}
- Age: {age}
- Current Health Status: {healthStatus}
- Recent Health History: {healthHistory}
{batchInfo}

**Environmental Context:**
- Location: {location}
- Weather: {weather}
- Temperature: {temperature}°C
- Humidity: {humidity}%

**Instructions:**
1. Carefully examine the image(s) for visible signs of illness, injury, or abnormality
2. Look for: skin conditions, posture problems, eye/nose discharge, swelling, wounds, parasites, coat/feather condition
3. Consider the species-specific health indicators
4. Provide confidence level for your assessment
5. If this is a batch with multiple affected animals, consider disease spread risk and recommend isolation/quarantine accordingly

**Response Format (JSON):**
{
  "diagnosis": "Primary condition identified",
  "confidence": 0.0-1.0,
  "severity": "low|moderate|high|critical",
  "symptoms": ["List of observed symptoms"],
  "possibleConditions": [
    {
      "name": "Condition name",
      "probability": 0.0-1.0,
      "description": "Brief description"
    }
  ],
  "treatment": [
    {
      "priority": 1,
      "action": "Treatment step",
      "timing": "When to apply",
      "notes": "Additional notes"
    }
  ],
  "prevention": ["Preventive measures"],
  "urgency": "immediate|within_24h|within_week|routine",
  "veterinaryRequired": true|false,
  "quarantineRecommended": true|false,
  "spreadRisk": "Description of disease spread risk if applicable",
  "followUpDays": 7,
  "additionalNotes": "Any other relevant information"
}`;

const VET_CHAT_SYSTEM_PROMPT = `You are an expert veterinary AI assistant helping farmers manage livestock health. You have access to the animal's complete health history, current diagnosis, and environmental conditions.

**Animal Profile:**
- Species: {species}
- Breed: {breed}
- Name/ID: {name}
- Current Diagnosis: {diagnosis}
- Severity: {severity}
- Symptoms: {symptoms}

**Guidelines:**
1. Provide practical, actionable advice suitable for farmers
2. Consider the local conditions and resources available
3. Recommend professional veterinary care when appropriate
4. Be specific about dosages, timing, and procedures when safe to do so
5. Explain the reasoning behind your recommendations
6. Alert to any warning signs that require immediate attention

Respond in a helpful, professional manner. If you're unsure about something, say so and recommend consulting a local veterinarian.`;

export class LivestockDiagnosisService {
  /**
   * Create a new livestock health diagnosis
   */
  async createDiagnosis(
    livestockId: string,
    userId: string,
    imageBuffers: Buffer[],
    additionalSymptoms?: string[],
    affectedCount?: number
  ) {
    const livestock = await Livestock.findById(livestockId).populate('farmId');
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const farm = livestock.farmId as any;
    if (!farm) {
      throw new Error('Farm not found');
    }

    // Upload images to Cloudinary
    const uploadResults = await Promise.all(
      imageBuffers.map((buffer) =>
        new Promise<{ secure_url: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'agroguardian/livestock-diagnoses', resource_type: 'image' },
            (error, result) => {
              if (error || !result) return reject(error || new Error('Upload failed'));
              resolve(result);
            }
          );
          stream.end(buffer);
        })
      )
    );

    const imageUrls = uploadResults.map(r => r.secure_url);

    // Determine batch info
    const isBatch = livestock.trackingType === 'batch';
    const batchSize = isBatch ? (livestock.quantity || 1) : undefined;
    const finalAffectedCount = isBatch && affectedCount ? affectedCount : undefined;

    // Create initial diagnosis record (processing)
    const diagnosis = await LivestockDiagnosis.create({
      livestockId: new Types.ObjectId(livestockId),
      farmId: farm._id,
      userId: new Types.ObjectId(userId),
      imageUrls,
      species: livestock.species,
      symptoms: additionalSymptoms || [],
      affectedCount: finalAffectedCount,
      batchSize,
      diagnosis: 'Analyzing...',
      confidence: 0,
      severity: 'low',
      treatment: [],
      prevention: [],
      status: 'processing',
      aiModel: 'google/gemma-4-26b-a4b-it:free'
    });

    logger.info(`Livestock diagnosis initiated for ${livestock.name || livestock.tagId || livestockId}`);

    // Process asynchronously via queue
    await addLivestockDiagnosisJob({ diagnosisId: diagnosis._id.toString() });

    return diagnosis;
  }

  /**
   * Process a queued diagnosis job by ID
   */
  async processDiagnosisJob(diagnosisId: string) {
    const diagnosis = await LivestockDiagnosis.findById(diagnosisId);
    if (!diagnosis) {
      throw new Error('Diagnosis not found');
    }

    const livestock = await Livestock.findById(diagnosis.livestockId).populate('farmId');
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const farm = livestock.farmId as any;

    return this.processLivestockDiagnosis(
      diagnosisId,
      diagnosis.imageUrls || [],
      livestock,
      farm,
      diagnosis.userId.toString(),
      (diagnosis as any).affectedCount,
      (diagnosis as any).batchSize
    );
  }

  /**
   * Process the diagnosis using AI
   */
  private async processLivestockDiagnosis(
    diagnosisId: string,
    imageUrls: string[],
    livestock: any,
    farm: any,
    userId: string,
    affectedCount?: number,
    batchSize?: number
  ) {
    try {
      // Get health history
      const healthRecords = await livestockHealthService.getAllHealthRecords(livestock._id.toString());
      
      // Get weather data
      const latestWeather = await WeatherData.findOne({ farmId: farm._id }).sort({ timestamp: -1 });

      // Calculate age
      let age = 'Unknown';
      if (livestock.dateOfBirth) {
        const ageMs = Date.now() - new Date(livestock.dateOfBirth).getTime();
        const years = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
        const months = Math.floor((ageMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
        age = years > 0 ? `${years} years ${months} months` : `${months} months`;
      }

      // Build health history summary
      const healthHistory = [
        `Vaccinations: ${healthRecords.vaccinations.length}`,
        `Treatments: ${healthRecords.treatments.length}`,
        `Past illnesses: ${healthRecords.illnesses.length}`,
        healthRecords.illnesses.length > 0 
          ? `Recent illness: ${healthRecords.illnesses[0]?.condition || 'Unknown'}`
          : ''
      ].filter(Boolean).join(', ');

      // Build batch info for the prompt
      let batchInfo = '';
      if (batchSize && batchSize > 1) {
        const affectedPercent = affectedCount 
          ? Math.round((affectedCount / batchSize) * 100)
          : 0;
        batchInfo = `
**Batch Information:**
- This is a BATCH of ${batchSize} animals
- Affected animals: ${affectedCount || 'Unknown'} (${affectedPercent}% of batch)
- IMPORTANT: Consider disease spread risk within the batch and recommend isolation/quarantine measures`;
      }

      // Prepare the prompt
      const prompt = LIVESTOCK_DIAGNOSIS_PROMPT
        .replace('{species}', livestock.species)
        .replace('{breed}', livestock.breed || 'Unknown')
        .replace('{age}', age)
        .replace('{healthStatus}', livestock.healthStatus)
        .replace('{healthHistory}', healthHistory || 'No prior records')
        .replace('{batchInfo}', batchInfo)
        .replace('{location}', `${farm.location?.city || ''}, ${farm.location?.country || ''}`)
        .replace('{weather}', latestWeather?.current?.weatherDescription || 'Unknown')
        .replace('{temperature}', String(latestWeather?.current?.temperature || 'Unknown'))
        .replace('{humidity}', String(latestWeather?.current?.humidity || 'Unknown'));

      // Call AI with images
      const aiResponse = await analyzeImageWithGemini(imageUrls, prompt);

      // Parse AI response
      let parsedResponse: any;
      try {
        // Try to extract JSON from the response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        logger.warn('Failed to parse AI response as JSON, using fallback');
        parsedResponse = {
          diagnosis: aiResponse.substring(0, 500),
          confidence: 0.5,
          severity: 'moderate',
          symptoms: [],
          treatment: ['Please consult a veterinarian for accurate diagnosis'],
          prevention: ['Regular health monitoring'],
          urgency: 'within_24h',
          veterinaryRequired: true,
          quarantineRecommended: false,
          followUpDays: 3,
          additionalNotes: 'AI could not provide structured diagnosis. Manual review recommended.'
        };
      }

      // Convert treatment objects to strings if needed
      let treatmentSteps: string[] = [];
      if (Array.isArray(parsedResponse.treatment)) {
        treatmentSteps = parsedResponse.treatment.map((t: any) => {
          if (typeof t === 'string') return t;
          // Convert object to readable string
          return `[${t.timing || 'As needed'}] ${t.action}${t.notes ? ` (${t.notes})` : ''}`;
        });
      }

      // Convert prevention to strings if needed
      let preventionSteps: string[] = [];
      if (Array.isArray(parsedResponse.prevention)) {
        preventionSteps = parsedResponse.prevention.map((p: any) => {
          if (typeof p === 'string') return p;
          return p.action || p.description || String(p);
        });
      }

      // Update diagnosis record
      const updatedDiagnosis = await LivestockDiagnosis.findByIdAndUpdate(
        diagnosisId,
        {
          diagnosis: parsedResponse.diagnosis,
          confidence: parsedResponse.confidence || 0.5,
          severity: parsedResponse.severity || 'moderate',
          symptoms: parsedResponse.symptoms || [],
          possibleConditions: parsedResponse.possibleConditions || [],
          treatment: treatmentSteps,
          prevention: preventionSteps,
          urgency: parsedResponse.urgency || 'within_24h',
          veterinaryRequired: parsedResponse.veterinaryRequired ?? true,
          quarantineRecommended: parsedResponse.quarantineRecommended ?? false,
          followUpDays: parsedResponse.followUpDays || 7,
          additionalNotes: parsedResponse.additionalNotes,
          status: 'completed',
          analyzedAt: new Date()
        },
        { new: true }
      );

      // Update livestock health status based on severity
      let newHealthStatus = livestock.healthStatus;
      if (parsedResponse.severity === 'critical') {
        newHealthStatus = 'critical';
      } else if (parsedResponse.severity === 'high') {
        newHealthStatus = 'sick';
      } else if (parsedResponse.severity === 'moderate') {
        newHealthStatus = 'under_treatment';
      }

      if (newHealthStatus !== livestock.healthStatus) {
        await Livestock.findByIdAndUpdate(livestock._id, { healthStatus: newHealthStatus });
      }

      // Send notification
      await createNotification(
        userId,
        'Livestock Diagnosis Complete',
        `Health assessment for ${livestock.name || livestock.tagId || livestock.species} is ready. Severity: ${parsedResponse.severity}`,
        'diagnosis',
        `/livestock/${livestock._id}`
      );

      // Send email for critical cases
      if (parsedResponse.severity === 'critical' || parsedResponse.urgency === 'immediate') {
        const user = await User.findById(userId);
        if (user) {
          await sendBrevoEmail(
            user.email,
            '🚨 Urgent: Critical Livestock Health Alert',
            `<h2>Critical Health Alert</h2>
            <p>Your ${livestock.species} (${livestock.name || livestock.tagId}) requires immediate attention.</p>
            <p><strong>Diagnosis:</strong> ${parsedResponse.diagnosis}</p>
            <p><strong>Severity:</strong> ${parsedResponse.severity}</p>
            <p><strong>Action Required:</strong> ${parsedResponse.veterinaryRequired ? 'Contact a veterinarian immediately' : 'Follow treatment plan'}</p>
            <a href="${process.env.FRONTEND_URL}/livestock/${livestock._id}">View Full Diagnosis</a>`
          );
        }
      }

      logger.info(`Livestock diagnosis completed for ${livestock._id}: ${parsedResponse.diagnosis}`);
      return updatedDiagnosis;
    } catch (error) {
      logger.error('Livestock diagnosis processing error', error);
      
      await LivestockDiagnosis.findByIdAndUpdate(diagnosisId, {
        status: 'failed',
        additionalNotes: error instanceof Error ? error.message : 'Processing failed'
      });

      throw error;
    }
  }

  /**
   * Get diagnosis by ID
   */
  async getDiagnosis(diagnosisId: string, userId: string) {
    const diagnosis = await LivestockDiagnosis.findOne({
      _id: diagnosisId,
      userId: new Types.ObjectId(userId)
    }).populate('livestockId', 'name tagId species breed healthStatus imageUrls');

    if (!diagnosis) {
      throw new Error('Diagnosis not found');
    }

    return diagnosis;
  }

  /**
   * Get all diagnoses for a livestock
   */
  async getDiagnosesByLivestock(livestockId: string) {
    return LivestockDiagnosis.find({ livestockId: new Types.ObjectId(livestockId) })
      .sort({ createdAt: -1 });
  }

  /**
   * Get all diagnoses for a farm
   */
  async getDiagnosesByFarm(farmId: string, options: { status?: string; limit?: number } = {}) {
    const query: any = { farmId: new Types.ObjectId(farmId) };
    if (options.status) {
      query.status = options.status;
    }

    return LivestockDiagnosis.find(query)
      .populate('livestockId', 'name tagId species breed healthStatus')
      .sort({ createdAt: -1 })
      .limit(options.limit || 50);
  }

  /**
   * Chat about a diagnosis
   */
  async chatAboutDiagnosis(
    diagnosisId: string,
    userId: string,
    message: string
  ) {
    const diagnosis = await LivestockDiagnosis.findOne({
      _id: diagnosisId,
      userId: new Types.ObjectId(userId)
    }).populate('livestockId');

    if (!diagnosis) {
      throw new Error('Diagnosis not found');
    }

    const livestock = diagnosis.livestockId as any;

    // Build system prompt with context
    const systemPrompt = VET_CHAT_SYSTEM_PROMPT
      .replace('{species}', livestock?.species || 'Unknown')
      .replace('{breed}', livestock?.breed || 'Unknown')
      .replace('{name}', livestock?.name || livestock?.tagId || 'Unknown')
      .replace('{diagnosis}', diagnosis.diagnosis)
      .replace('{severity}', diagnosis.severity)
      .replace('{symptoms}', diagnosis.symptoms?.join(', ') || 'None recorded');

    // Get chat history
    const chatHistory = (diagnosis as any).chatMessages?.map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    })) || [];

    // Get AI response
    const aiResponse = await chatWithContext(message, chatHistory, systemPrompt);

    // Save chat message
    (diagnosis as any).chatMessages = (diagnosis as any).chatMessages || [];
    (diagnosis as any).chatMessages.push(
      { role: 'user', content: message, timestamp: new Date() },
      { role: 'assistant', content: aiResponse, timestamp: new Date() }
    );
    await diagnosis.save();

    return {
      userMessage: message,
      aiResponse,
      totalMessages: ((diagnosis as any).chatMessages || []).length
    };
  }

  /**
   * Get chat history for a diagnosis
   */
  async getChatHistory(diagnosisId: string, userId: string) {
    const diagnosis = await LivestockDiagnosis.findOne({
      _id: diagnosisId,
      userId: new Types.ObjectId(userId)
    }).select('chatMessages');

    if (!diagnosis) {
      throw new Error('Diagnosis not found');
    }

    return (diagnosis as any).chatMessages || [];
  }

  /**
   * Update diagnosis status
   */
  async updateDiagnosisStatus(
    diagnosisId: string,
    userId: string,
    status: 'detected' | 'treating' | 'resolved'
  ) {
    const diagnosis = await LivestockDiagnosis.findOneAndUpdate(
      { _id: diagnosisId, userId: new Types.ObjectId(userId) },
      { status },
      { new: true }
    );

    if (!diagnosis) {
      throw new Error('Diagnosis not found');
    }

    // Update livestock health status if resolved
    if (status === 'resolved') {
      await Livestock.findByIdAndUpdate(diagnosis.livestockId, {
        healthStatus: 'healthy'
      });
    }

    return diagnosis;
  }
}

export const livestockDiagnosisService = new LivestockDiagnosisService();
