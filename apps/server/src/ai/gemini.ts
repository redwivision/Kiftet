import { GoogleGenAI } from "@google/genai";

import { env } from "../env.server";

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export const DEFAULT_MODEL = "gemini-2.0-flash";

export type ConceptChecklistItem = {
  conceptText: string;
  isMisconception: boolean;
  weight: number;
};

export type GapAnalysis = {
  covered: string[];
  missing: string[];
  misconceptions: string[];
  score: number;
};

export type MicroLesson = {
  text: string;
};

export type RetestQuestion = {
  question: string;
};

export type AiService = {
  extractConcepts(rawText: string): Promise<ConceptChecklistItem[]>;
  gradeRecall(transcript: string, concepts: ConceptChecklistItem[]): Promise<GapAnalysis>;
  generateMicroLesson(gaps: GapAnalysis, concepts: ConceptChecklistItem[]): Promise<MicroLesson>;
  generateRetestQuestions(gaps: GapAnalysis, concepts: ConceptChecklistItem[]): Promise<RetestQuestion[]>;
};

// Phase 2 implements the bodies against Gemini. The seam exists now so the
// API shell and web flow can be built against stable signatures.
export const ai: AiService = {
  async extractConcepts() {
    return [];
  },
  async gradeRecall() {
    return { covered: [], missing: [], misconceptions: [], score: 0 };
  },
  async generateMicroLesson() {
    return { text: "" };
  },
  async generateRetestQuestions() {
    return [];
  },
};

void genAI;
void DEFAULT_MODEL;