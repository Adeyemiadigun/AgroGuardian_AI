# AgroGuardian AI - Project Demo Documentation

AgroGuardian AI is a comprehensive **Climate-Smart Agriculture** and **Regenerative Farming** platform designed to empower farmers with AI-driven insights, risk mitigation tools, and carbon monetization pathways.

---

## 🚀 1. Core Services & Architecture

### 💎 Carbon Credit & Tracking System
*   **Objective**: Incentivize sustainable practices by quantifying and certifying carbon sequestration.
*   **Carbon Engine**: A dynamic calculation engine that uses a multi-factor formula:
    *   **Formula**: `Carbon (tons CO2e) = Area × CarbonFactor × CropMultiplier × Duration`
    *   **Dynamic Factors**: Factors are automatically adjusted based on **Soil Type** (Clay/Loamy/Sandy), **Climate Zone** (Auto-detected via Latitude), and **Crop Variety**.
*   **Additionality Check**: A smart logic gate that ensures only *new* sustainable practices (not baseline ones) are eligible for credits.
*   **AI Verification**: Uses Gemini/OpenAI vision models to verify uploaded "Evidence" photos of practices (e.g., verifying a "No-Till" field or "Cover Crop" growth).

### ⛈️ Enhanced Climate Risk System
*   **Objective**: Provide high-precision, context-aware weather risk assessments.
*   **5-Factor Model**: Calculates specific risks for **Drought, Flood, Heat, Pest, and Disease**.
*   **Soil & Irrigation Awareness**: Unlike standard weather apps, AgroGuardian adjusts risk based on:
    *   **Soil Drainage**: Clay soil increases flood risk; Sandy soil increases drought risk.
    *   **Irrigation Method**: Flood irrigation compounds pest/disease risk; Drip irrigation mitigates drought and heat stress.
*   **Precision Windows**: Provides hourly optimal "slots" for:
    *   **Planting**: Based on soil moisture and germination temperatures.
    *   **Harvesting**: Based on dry conditions and low wind.
    *   **Spraying**: Based on zero-rain and low-wind drift parameters.

### 🐄 Livestock Health & Management
*   **AI-Vet Diagnosis**: High-precision vision analysis for livestock (Cattle, Poultry, Small Ruminants, Pigs).
*   **Species-Specialized Logic**:
    *   **Poultry**: Detects Newcastle, Gumboro, and Fowl Pox with specific biosecurity steps.
    *   **Cattle**: Identifies Lumpy Skin, FMD, and nutritional deficiencies.
*   **Herd Protection Algorithm**: Automatically calculates isolation requirements and vaccination guidance for uninfected animals in the same flock/herd.
*   **Breeding Engine**:
    *   **Pregnancy Tracking**: Auto-calculates gestation periods by species.
    *   **Follow-up Tasks**: Generates a timeline of tasks (Nutrition checks, Antenatal checks, Birthing prep) from conception to birth.
    *   **Animal Welfare**: Enforces a "Postpartum Cooldown" (60-day rest period) between cycles.

---

## 🧠 2. The "Engines" (Algorithms & Logic)

### 📊 Resilience Scoring Algorithm
Calculates a 0-100 score representing the farm's ability to withstand shocks.
*   **Components**:
    *   **Management (40%)**: Ratio of resolved diagnoses and active consultation severity.
    *   **Climate Adaptation (30%)**: Success in mitigating high-risk weather events.
    *   **Diversity (30%)**: Crop/Livestock variety to spread financial risk.
    *   **Sustainability Index**: Adoption rate of climate-smart practices across 4 categories (Soil, Water, Crop, Agroforestry).

### 🤖 Multi-Model AI Engine
The "Brain" of the project uses a robust OpenRouter integration:
*   **Primary Models**: GPT-4o mini, Gemini 1.5 Flash.
*   **Self-Healing Logic**:
    *   **Automatic Fallback**: If a model is rate-limited or unavailable, the engine instantly switches to a fallback (e.g., GPT-4o → Gemini → Gemma).
    *   **Structured Output (Zod)**: All AI responses are strictly parsed into JSON schemas to ensure UI consistency and prevent "LLM hallucination" in critical vet advice.
    *   **JSON Repair**: If an AI provides malformed JSON, a secondary "Repair Agent" automatically fixes the syntax before the user sees it.

---

## 🛠️ 3. Implementation Details

### Backend (Node.js/TypeScript)
*   **Queue-Based Processing**: Heavy tasks (AI analysis, Weather sync, Carbon math) are handled by **BullMQ/Redis** workers to ensure zero UI lag.
*   **Security**: Role-based access (Farmer/Admin/Vet) with JWT and session-based authentication.
*   **Storage**: Cloudinary for high-res farm/livestock evidence; MongoDB for flexible agricultural data.

### Frontend (React/Vite/Tailwind)
*   **Real-time Dashboards**: Visualizes weather trends, carbon accrual, and resilience metrics.
*   **Interactive Chat**: Dedicated UI for "Chatting with your Diagnosis" using historical context.
*   **Mobile-First Design**: Optimized for farmers in the field using Tailwind CSS.

---

## 🎯 4. Demo Scenarios (Step-by-Step)

### Scenario A: The Climate-Smart Farmer
1.  **Create a Farm**: Select "Clay" soil and "Flood" irrigation.
2.  **Weather Sync**: Show how the app warns of **High Flood Risk** due to the soil/irrigation combo, even if rain is moderate.
3.  **Precision Windows**: Show the "Best Planting Date" and why some days are marked "Unviable."

### Scenario B: Carbon Monetization
1.  **Log a Practice**: Log "No-Till" farming on a 10-hectare plot.
2.  **Upload Evidence**: Upload a photo of the tilled land.
3.  **Check Credits**: See the "Estimated Carbon" sequestered and how it accrues in the dashboard.

### Scenario C: Livestock Emergency
1.  **Livestock Diagnosis**: Upload a photo of a sick cow/bird.
2.  **AI Analysis**: Show the **Severity**, **Treatment Plan**, and **Herd Protection** advice.
3.  **Chat**: Ask the AI: "Is this contagious to my other goats?" and see the context-aware response.
4.  **Breeding**: Start a breeding record and show the automated "Follow-up Tasks" timeline.

---

**AgroGuardian AI: Protecting the Farm, Growing the Future.**
