import { McpServer } from "skybridge/server";
import { z } from "zod";
import { fal } from "@fal-ai/client";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { Request, Response } from "express";

// ---------- Panel script generator ----------

async function generatePanels(heroName: string, story: string): Promise<string[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return [];

  const openai = createOpenAI({ apiKey: openaiKey });

  const prompt = `You are a comic book writer. Create a 9-panel comic story based on these details:

Hero: ${heroName}
Story Overview: ${story}

Generate exactly 9 panel descriptions that tell a complete story. Each panel must have:
1. A scene description (1-2 vivid sentences describing the visual action)
2. A short punchy dialogue or caption (under 10 words)

CRITICAL CHARACTER RULES:
- ONLY use ${heroName} and characters explicitly mentioned in the story
- DO NOT invent new character names
- Use generic terms like "their friend", "a companion" for unnamed people

Format each panel as a single line:
[scene description] [dialogue]: "quote"

Separate the 9 panels with "|||" — no line breaks between them.

Example:
${heroName} stands at a crossroads, map in hand, grinning at the adventure ahead. [dialogue]: "This is going to be epic!"|||The group sprints through a sunlit forest, laughing. [dialogue]: "Try to keep up!"

Now generate all 9 panels:`;

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt,
    maxOutputTokens: 1200,
  });

  let panels = text
    .split("|||")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Fallback: try splitting by newlines if delimiter parsing fails
  if (panels.length < 9) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10);
    if (lines.length >= 9) panels = lines.slice(0, 9);
  }

  if (panels.length > 9) panels = panels.slice(0, 9);
  while (panels.length < 9) {
    panels.push(`Continue the adventure in panel ${panels.length + 1}.`);
  }

  return panels;
}

// ---------- FAL prompt builders ----------

function buildImageModePrompt(heroName: string, story: string, panels: string[]): string {
  const panelList = panels
    .map((p, i) => `Panel ${i + 1}: ${p}`)
    .join("\n");

  return `CRITICAL: REFERENCE IMAGE 1 IS THE ONLY SOURCE OF ${heroName.toUpperCase()}'S APPEARANCE.

CHARACTER-TO-IMAGE MAPPING:
Reference Image 1: ${heroName}

APPEARANCE RULES:
• Copy exact features, hair, outfit from Reference Image 1
• Keep identical across all 9 panels
• Do not modify, age, or invent any details

STYLE:
• Clean ligne claire style, bold flat colors, high contrast, bright daylight lighting, vintage adventure feel without muted colors, clean outlines, no gradients
• 3×3 grid layout with exactly 9 equal panels, clean white gutters

STORY:
${story}

BOARD LAYOUT:
${panelList}

Ensure:
• Story flows coherently from Panel 1 to Panel 9
• Each panel has clear dialogue/captions as shown above
• Speech bubbles contain ONLY the spoken text (no character name prefixes)
• Character appearance comes ONLY from Reference Image 1`;
}

function buildTextModePrompt(heroName: string, story: string, panels: string[]): string {
  const panelList = panels
    .map((p, i) => `Panel ${i + 1}: ${p}`)
    .join("\n");

  return `CHARACTERS:
• ${heroName}: the hero of this story

STYLE:
• Clean ligne claire style, bold flat colors, high contrast, bright daylight lighting, vintage adventure feel without muted colors, clean outlines, no gradients
• Keep ${heroName}'s appearance consistent across all 9 panels
• 3×3 grid layout with exactly 9 equal panels, clean white gutters

STORY:
${story}

BOARD LAYOUT:
${panelList}

Ensure:
• Story flows coherently from Panel 1 to Panel 9
• Each panel has clear dialogue/captions as shown above
• Speech bubbles contain ONLY the spoken text (no character name prefixes)`;
}

// ---------- Magic 8-ball answers ----------

const Answers = [
  "As I see it, yes",
  "Don't count on it",
  "It is certain",
  "It is decidedly so",
  "Most likely",
  "My reply is no",
  "My sources say no",
  "Outlook good",
  "Outlook not so good",
  "Signs point to yes",
  "Very doubtful",
  "Without a doubt",
  "Yes definitely",
  "Yes",
  "You may rely on it",
];

// ---------- Server ----------

const server = new McpServer(
  {
    name: "alpic-openai-app",
    version: "0.0.1",
  },
  { capabilities: {} },
)
  .registerWidget(
    "magic-8-ball",
    {
      description: "Magic 8 Ball",
    },
    {
      description: "For fortune-telling or seeking advice.",
      inputSchema: {
        question: z.string().describe("The user question."),
      },
    },
    async ({ question }) => {
      try {
        const hash = question
          .split("")
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const answer = Answers[hash % Answers.length];
        return {
          structuredContent: { answer },
          content: [],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  )
  .registerWidget(
    "comic-generator",
    {
      description: "AI Comic Generator",
    },
    {
      description:
        "Generates a personalised 9-panel comic from a photo and a short story.",
      inputSchema: {
        heroName: z.string().describe("The name of the hero / main character."),
        story: z
          .string()
          .describe(
            "A short story or adventure description for the comic (2-5 sentences).",
          ),
        photoUrl: z
          .string()
          .optional()
          .describe(
            "A public URL to a face photo of the hero. When provided the character's appearance is taken from the photo.",
          ),
      },
    },
    async ({ heroName, story, photoUrl }) => {
      try {
        const falKey = process.env.FAL_KEY;
        if (!falKey) {
          return {
            content: [
              {
                type: "text",
                text: "FAL_KEY environment variable is not configured.",
              },
            ],
            isError: true,
          };
        }

        fal.config({ credentials: falKey });

        const isImageMode = !!photoUrl;
        const resolvedPhotoUrl = photoUrl;

        // Generate detailed 9-panel script with OpenAI (falls back to simple story if key missing)
        const panels = await generatePanels(heroName, story);
        const hasPanels = panels.length === 9;

        const prompt = isImageMode
          ? hasPanels
            ? buildImageModePrompt(heroName, story, panels)
            : `CHARACTER REFERENCE: Reference Image 1 is ${heroName}\n\nAPPEARANCE RULES:\n• Copy exact features, hair, outfit from Reference Image 1\n• Keep identical across all 9 panels\n\nSTYLE:\n• Clean ligne claire style, bold flat colors, high contrast, bright daylight lighting, vintage adventure feel\n\nLAYOUT: 3×3 grid, exactly 9 equal square panels, clean white gutters\n\nSTORY:\n${story}\n\nDraw 9 sequential panels. Keep ${heroName}'s appearance faithful to Reference Image 1 in every panel.`
          : hasPanels
            ? buildTextModePrompt(heroName, story, panels)
            : `CHARACTERS:\n• ${heroName}: the hero\n\nSTYLE:\n• Clean ligne claire style, bold flat colors, high contrast, bright daylight lighting, vintage adventure feel\n• Keep ${heroName} consistent across all 9 panels\n\nLAYOUT: 3×3 grid, 9 equal panels, clean white gutters\n\nSTORY:\n${story}\n\nDraw 9 sequential panels illustrating the story.`;

        const falInput = isImageMode
          ? {
              prompt,
              image_urls: [resolvedPhotoUrl as string],
              aspect_ratio: "3:4" as const,
              num_images: 1,
            }
          : { prompt, aspect_ratio: "3:4" as const, num_images: 1 };

        const falModel = isImageMode
          ? "fal-ai/nano-banana-pro/edit"
          : "fal-ai/nano-banana-pro";

        const result = await fal.subscribe(falModel, { input: falInput });

        const imageUrl =
          (result as any)?.data?.images?.[0]?.url ||
          (result as any)?.images?.[0]?.url ||
          (result as any)?.data?.image?.url;

        if (!imageUrl) {
          return {
            content: [{ type: "text", text: "No image was generated." }],
            isError: true,
          };
        }

        return {
          structuredContent: { imageUrl, heroName, story },
          content: [],
          isError: false,
        };
      } catch (error: any) {
        const detail =
          error?.body?.detail?.[0]?.msg ||
          error?.body?.detail ||
          error?.message ||
          String(error);
        return {
          content: [
            {
              type: "text",
              text: `Comic generation failed: ${detail}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

server
  .use(
    "/upload",
    // Stream raw image body directly — bypasses the 100KB express.json() limit
    async (req: Request, res: Response) => {
      try {
        const falKey = process.env.FAL_KEY;
        if (!falKey) {
          res.status(500).json({ error: "FAL_KEY not configured" });
          return;
        }
        fal.config({ credentials: falKey });

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const contentType = (req.headers["content-type"] ?? "image/jpeg").split(";")[0];
        const blob = new Blob([buffer], { type: contentType });
        const file = new File([blob], "photo.jpg", { type: contentType });
        const url = await fal.storage.upload(file);

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.json({ url });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    },
  )
  .run();

export type AppType = typeof server;
