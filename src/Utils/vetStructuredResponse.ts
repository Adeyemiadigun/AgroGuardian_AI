import { z } from 'zod';
import { extractJsonFromLLM } from './llmJson';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const confidenceSchema = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n)) return 0.5;
    // accept 0-100 as percentage
    return clamp01(n > 1 ? n / 100 : n);
  });

const severitySchema = z
  .enum(['low', 'medium', 'high', 'critical', 'moderate'])
  .transform((v) => (v === 'moderate' ? 'medium' : v));

const nonEmptyString = (label: string) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? '' : v),
    z.string().trim().min(1, { message: `${label} is required` })
  );

export const VetAiStructuredResponseSchema = z.object({
  likelyCondition: nonEmptyString('likelyCondition'),
  confidence: confidenceSchema.default(0.5),
  severity: severitySchema.default('medium'),

  why: z.array(z.string().trim().min(1)).optional().default([]),
  differentials: z
    .array(
      z.object({
        name: nonEmptyString('differentials[].name'),
        probability: confidenceSchema.optional(),
        notes: z.string().trim().optional(),
      })
    )
    .optional()
    .default([]),

  biosecurity: z.array(z.string().trim().min(1)).optional().default([]),
  firstAid: z.array(z.string().trim().min(1)).min(1, 'firstAid must have at least 1 item'),
  homeCare: z.array(z.string().trim().min(1)).min(1, 'homeCare must have at least 1 item'),
  whenToSeeVet: z.array(z.string().trim().min(1)).optional().default([]),

  vetNow: z.boolean().optional().default(false),
  quarantineRecommended: z.boolean().optional().default(false),

  questions: z
    .array(z.string().trim().min(1))
    .min(2, 'questions must contain exactly 2 items')
    .transform((q) => q.slice(0, 2))
    .refine((q) => q.length === 2, 'questions must contain exactly 2 items'),

  notes: z.string().trim().optional(),
});

export type VetAiStructuredResponse = z.infer<typeof VetAiStructuredResponseSchema>;

export const parseVetAiStructuredResponse = (raw: string): VetAiStructuredResponse => {
  const jsonStr = extractJsonFromLLM(raw);
  const obj = JSON.parse(jsonStr);
  return VetAiStructuredResponseSchema.parse(obj);
};

export const formatVetAiStructuredResponseToText = (r: VetAiStructuredResponse) => {
  const lines: string[] = [];

  const confidencePct = Math.round((r.confidence || 0) * 100);

  lines.push(`Likely Condition: ${r.likelyCondition}`);
  lines.push(`Confidence: ${confidencePct}%`);
  lines.push(`Severity: ${r.severity}`);

  if (r.why?.length) {
    lines.push('');
    lines.push('Why (key signs):');
    r.why.slice(0, 8).forEach((x) => lines.push(`- ${x}`));
  }

  if (r.differentials?.length) {
    lines.push('');
    lines.push('Other possibilities (differentials):');
    r.differentials.slice(0, 5).forEach((d) => {
      const p = typeof d.probability === 'number' ? ` (${Math.round(d.probability * 100)}%)` : '';
      lines.push(`- ${d.name}${p}${d.notes ? `: ${d.notes}` : ''}`);
    });
  }

  if (r.biosecurity?.length) {
    lines.push('');
    lines.push('Biosecurity / Isolation:');
    r.biosecurity.slice(0, 8).forEach((x) => lines.push(`- ${x}`));
  }

  lines.push('');
  lines.push('First Aid (do now):');
  r.firstAid.slice(0, 10).forEach((x) => lines.push(`- ${x}`));

  lines.push('');
  lines.push('Safe Home Care (next 24–72h):');
  r.homeCare.slice(0, 12).forEach((x) => lines.push(`- ${x}`));

  if (r.whenToSeeVet?.length || r.vetNow) {
    lines.push('');
    lines.push('When to Call/Visit a Vet:');
    if (r.vetNow) lines.push('- URGENT: Seek veterinary help as soon as possible.');
    r.whenToSeeVet.slice(0, 8).forEach((x) => lines.push(`- ${x}`));
  }

  lines.push('');
  lines.push('Follow-up Questions:');
  lines.push(`1) ${r.questions[0]}`);
  lines.push(`2) ${r.questions[1]}`);

  if (r.notes) {
    lines.push('');
    lines.push(`Notes: ${r.notes}`);
  }

  return lines.join('\n');
};
