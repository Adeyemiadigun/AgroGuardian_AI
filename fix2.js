const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/Controllers/**/*.ts');
const argsToCast = [
  'farmId', 'userId', 'status', 'livestockId', 'diagnosisId', 
  'taskId', 'scheduleId', 'feedingId', 'breedingId', 'recordId', 
  'checkupId', 'dewormingId', 'illnessId', 'treatmentId', 'vaccinationId',
  'consultationId', 'limit', 'days'
];
const regex1 = new RegExp('\\((' + argsToCast.join('|') + '),', 'g');
const regex2 = new RegExp(',\\s*(' + argsToCast.join('|') + ')([,\\)])', 'g');
const regex3 = new RegExp('\\((' + argsToCast.join('|') + ')\\)', 'g');

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(regex1, '($1 as string,');
  c = c.replace(regex2, ', $1 as string$2');
  c = c.replace(regex3, '($1 as string)');
  fs.writeFileSync(f, c);
}
console.log('Fixed arguments in controllers');
