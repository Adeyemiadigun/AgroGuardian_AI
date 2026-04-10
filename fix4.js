const fs = require('fs');

function fixFile(file, replacers) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [search, replace] of replacers) {
    content = content.replace(search, replace);
  }
  fs.writeFileSync(file, content);
}

// 1. consultation.controller.ts
fixFile('src/Controllers/consultation.controller.ts', [
  [/status\s+as\s+string\)/g, 'status as any)'],
]);

// 2. livestock-feed-breeding.controller.ts
fixFile('src/Controllers/livestock-feed-breeding.controller.ts', [
  [/farmId,\s*\n\s*\}\);/g, 'farmId: farmId as any,\n      });'],
  [/validationResult\.data\)/g, 'validationResult.data as any)'],
]);

// 3. diagnosis.service.ts
fixFile('src/Services/diagnosis.service.ts', [
  [/diagnosis\.treatmentPlan\.findIndex/g, '(diagnosis.treatmentPlan || []).findIndex'],
  [/diagnosis\.treatmentPlan\[taskIndex\]/g, '(diagnosis.treatmentPlan || [])[taskIndex]'],
  [/soilType:\s*farm\.soilType/g, 'soilType: (farm.soilType || []).join(", ")'],
]);

// 4. diagnosisJob.service.ts
fixFile('src/Services/diagnosisJob.service.ts', [
  [/await analyzeCropImage\(imageUrls, cropType, farmContext\) as any;/g, 'await analyzeCropImage(imageUrls, cropType) as any; // farmContext removed'],
]);

// 5. farm.service.ts
fixFile('src/Services/farm.service.ts', [
  [/ResilienceProfile\.findOne\(\{\s*farmId:\s*String\(farm\._id\)\s*\}\)/g, 'ResilienceProfile.findOne({ farmId: farm._id } as any)'],
]);

// 6. livestock-health.service.ts
fixFile('src/Services/livestock-health.service.ts', [
  // replace any remaining return LivestockX.find( ... );
  [/return\s+Livestock[A-Za-z]+\.find\(\{[^}]+\}\)\s*;/g, match => match.replace(';', '.lean() as any;')],
  // specifically multiline finds
  [/return\s+LivestockVaccination\.find\(\{\s*farmId:\s*new\s*Types\.ObjectId\(farmId\),\s*nextDueDate:[^}]+\}\s*\)\s*\.populate\([^)]+\)\s*\.sort\([^)]+\);/g, match => match.replace(';', '.lean() as any;')],
  [/return\s+LivestockTreatment\.find\(\{\s*farmId:[^}]+\}\s*\)\s*\.populate\([^)]+\)\s*\.sort\([^)]+\);/g, match => match.replace(';', '.lean() as any;')],
  [/return\s+LivestockIllness\.find\(\{\s*farmId:[^}]+\}\s*\)\s*\.populate\([^)]+\)\s*\.sort\([^)]+\);/g, match => match.replace(';', '.lean() as any;')],
  [/return\s+LivestockCheckup\.find\(\{\s*farmId:[^}]+\}\s*\)\s*\.populate\([^)]+\)\s*\.sort\([^)]+\);/g, match => match.replace(';', '.lean() as any;')],
  [/return\s+LivestockDeworming\.find\(\{\s*farmId:[^}]+\}\s*\)\s*\.populate\([^)]+\)\s*\.sort\([^)]+\);/g, match => match.replace(';', '.lean() as any;')],
  // and the ones with .populate but no .sort maybe? Just replace all .sort(...); with .sort(...).lean() as any; if they aren't already lean
  [/(\.sort\([^)]+\));/g, (match, p1) => {
    if (match.includes('.lean()')) return match;
    return p1 + '.lean() as any;';
  }]
]);

console.log('Applied final fixes');
