
// src/types.ts

export interface SinglePromptSet {
  chinese: string;
}

export interface VersionedSinglePromptSet {
  withText: SinglePromptSet;
  withoutText: SinglePromptSet;
}

// NEW type for fusion mode
export interface FusionVersionPromptSet {
  detailed: SinglePromptSet; // Detailed description of the product
  simplified: SinglePromptSet; // Simplified, one-sentence description
}

export interface JimmStylePrompts {
  positive: SinglePromptSet;
  negative: SinglePromptSet;
}

export interface DualPrompts {
    fusionWithSubject: FusionVersionPromptSet; // Creative Fusion
    directFusion: VersionedSinglePromptSet;      // "Perfect Combination" - Direct subject swap
    fusionBackgroundOnly: VersionedSinglePromptSet; // Background extraction
}


export interface ClassicPromptSet {
  classic: SinglePromptSet;
}

export interface VersionedJimmStylePrompts {
  withText: JimmStylePrompts;
  withoutText: JimmStylePrompts;
}

export interface VersionedClassicPromptSet {
  withText: ClassicPromptSet;
  withoutText: ClassicPromptSet;
}

export interface CombinedSinglePrompts {
  professional: VersionedJimmStylePrompts;
  classic: VersionedClassicPromptSet;
}

// A union type for all possible prompt structures
export type Prompts = CombinedSinglePrompts | DualPrompts;

// History Record Type
export interface HistoryRecord {
  id: string;
  timestamp: number;
  folderName: string; // e.g., "2023.11.20" or custom name
  mode: 'single' | 'dual' | 'multi';
  images: {
    main?: string; // Base64 (Single/Dual Main)
    background?: string; // Base64 (Dual Background)
    multi?: string[]; // Base64 Array (Multi Mode)
  };
  prompts: Prompts;
  // Key: Hash of the prompt text, Value: Base64 Image string
  generatedImages?: Record<string, string>;
}
