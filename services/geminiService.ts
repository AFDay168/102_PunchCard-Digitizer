
import { GoogleGenAI, Type } from "@google/genai";
import { PunchCardData, NameMapping } from "../types";

export async function extractPunchCardData(
  base64Image: string,
  knownNames: NameMapping[],
  officialNames: string[] = []
): Promise<PunchCardData[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultYear = lastMonthDate.getFullYear();
  const defaultMonth = (lastMonthDate.getMonth() + 1).toString().padStart(2, '0');
  const monthName = lastMonthDate.toLocaleString('default', { month: 'long' });

  const mappingContext = knownNames.length > 0 
    ? `Learned handwritten corrections: ${knownNames.map(n => `"${n.extracted}" -> "${n.corrected}"`).join(", ")}`
    : "";

  const officialContext = officialNames.length > 0
    ? `OFFICIAL STAFF LIST (Match extracted names to these EXACTLY if possible): ${officialNames.join(", ")}`
    : "";

  const systemInstruction = `
    Analyze this image containing handwritten punch card records. 
    Extract data for EVERY separate punch card visible.
    
    CONTEXT:
    Punch cards are typically for the PREVIOUS month. 
    Current Date: ${now.toDateString()}. 
    DEFAULT TARGET: ${monthName} ${defaultYear} (${defaultYear}/${defaultMonth}).

    STAFF NAME MATCHING:
    ${officialContext}
    ${mappingContext}

    TIME FORMATTING RULES (CRITICAL):
    1. Always use 24-hour format (HH:mm).
    2. AUTO-CORRECTION FOR AFTERNOON SHIFTS: Handwritten single-digit hours (1-9) usually represent PM times.
       - If you see "7:00", convert it to "19:00".
       - If you see "5:30", convert it to "17:30".
       - If you see "1:00", convert it to "13:00".
       - Only keep as AM (e.g., 07:00) if it is explicitly marked as AM or logically fits an early morning start (like 07:00 for a Time In). However, for "Time Out", single digits are almost ALWAYS PM.
    3. INCOMPLETE RECORDS: Include EVERY row identified on the card.
       - If a row has a "Time In" but no "Time Out", extract the "Time In" and use an empty string "" for "Time Out".
       - If a row has a "Time Out" but no "Time In", extract the "Time Out" and use an empty string "" for "Time In".
       - DO NOT skip rows just because they are missing a clock-in or clock-out event.

    CRITICAL EXTRACTION INSTRUCTIONS:
    1. Identify the handwritten STAFF NAME. 
       - If the handwritten name closely matches an item in the OFFICIAL STAFF LIST, use the OFFICIAL name.
       - Use learned corrections to fix common OCR misinterpretations.
    2. For each record row, construct a full DATE in "yyyy/mm/dd" format. 
       - If the Year/Month is missing or unclear, DEFAULT to ${defaultYear}/${defaultMonth} and combine it with the Day number.
    3. Extract "Time In" and "Time Out" for each date using the 24-hour PM auto-correction logic above.
    4. DO NOT calculate total hours.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1],
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            staffName: { type: Type.STRING },
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING, description: "Format: yyyy/mm/dd" },
                  timeIn: { type: Type.STRING },
                  timeOut: { type: Type.STRING },
                },
                required: ["date"], // Only Date is strictly required to form a row
              },
            },
            confidence: { type: Type.NUMBER },
          },
          required: ["staffName", "entries"],
        },
      },
    },
  });

  try {
    const results = JSON.parse(response.text.trim());
    return results.map((result: any) => ({
      ...result,
      id: Math.random().toString(36).substr(2, 9),
      imageUrl: base64Image,
    }));
  } catch (e) {
    throw new Error("Could not parse digitized data. Ensure the photo is clear.");
  }
}
