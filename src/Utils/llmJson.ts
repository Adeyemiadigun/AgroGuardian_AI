export const extractJsonFromLLM = (raw: string) => {
  if (!raw) return raw;
  let s = String(raw).trim();

  // Common case: ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) s = fence[1].trim();

  // If there's extra text, try to carve out the first JSON object/array.
  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return s.slice(firstObj, lastObj + 1).trim();
  }

  const firstArr = s.indexOf('[');
  const lastArr = s.lastIndexOf(']');
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    return s.slice(firstArr, lastArr + 1).trim();
  }

  return s;
};
