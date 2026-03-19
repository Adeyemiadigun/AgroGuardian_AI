# Regenerative Agriculture & Carbon Tracking System - Implementation Plan

This document tracks the development and progress of the backend features for the AgroGuardian AI platform.

## 🟢 Phase 1: Foundation & Reference Data (Admin)
- [x] **Model Enhancement: Additionality & Baselines**
  - [x] Add `baselinePractices` and `initialSoilCarbon` to `Farm` model.
  - [x] Add `isActive` and `category` to `Practice` model.
- [x] **Seeding Service**
  - [x] Create a `SeedService` to populate `Crops`, `Practices`, and `CarbonFactors`.
  - [x] Implement `POST /api/admin/seed` endpoint.

## 🚜 Phase 2: Farm & Activity Workflow (Farmer)
- [x] **Crop Season Management**
  - [x] Implement `CropSeason` Controller & Service.
  - [x] Endpoint: `POST /api/farms/:farmId/seasons` (Link farm to crop and area).
- [x] **Practice Activity Logging**
  - [x] Implement `ActivityLog` Controller & Service.
  - [x] Logic: Ensure activity area does not exceed `CropSeason` or `Farm` area.
  - [x] Endpoint: `POST /api/activities` (Log a practice like "No-Till").

## 💎 Phase 3: Carbon Calculation Engine (Core Logic)
- [x] **Sequestration Math Service (`CarbonService`)**
  - [x] Implement `calculateCarbon(activityLogId)` method.
  - [x] Formula: `Carbon = Area × CarbonFactor × CropMultiplier × Duration`.
  - [x] Implement "Additionality Check" (Compare against Farm baseline).
- [x] **Automated Trigger**
  - [x] Hook `CarbonService` into `ActivityLog` creation so calculations happen automatically.
- [x] **Evidence Linking**
  - [x] Update `ActivityLog` to support `Evidence` (image uploads) via Multer/Cloudinary.

## 📜 Phase 4: Credit Generation & Reporting
- [x] **Reporting Period Logic**
  - [x] Create a service to aggregate `CarbonCalculations` by year/season.
- [x] **Carbon Credit Issuance**
  - [x] Implement `CarbonCredit` model logic.
  - [x] Logic: Apply "Buffer Pool" (e.g., 20% holdback for risk).
  - [x] Endpoint: `GET /api/credits/farms/:farmId` for farmers.

## 🧪 Phase 5: Validation & Verification
- [x] **AI-Assisted Verification**
  - [x] Integrate existing `DiagnosisService` (Gemini/OpenAI) to verify practices from uploaded `Evidence` photos.
- [ ] **Unit Tests** (Optional/Follow-up)
  - [ ] Test carbon math for various soil types and practice durations.

---

## 📈 Current Status
**Total Progress: 100% (Core Implementation Complete)**
- Current Task: *All planned backend features implemented and integrated.*
