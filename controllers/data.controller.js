import { GoogleGenAI } from "@google/genai";
import { getJson } from "serpapi";

const generateAIData = async (ai, description) => {
    const prompt = `Analyze this data and return a JSON object categorization. 
    Category can be 1) PHARMA, 2) DIAGNOSTICS, 3) DOCTOR CONSULT, 4) PHYSIOTHERAPY and related categories
    One one category should be returned based on the data. The description is from a youtube video and may contain information about the video content, which can be used to determine the category.
The JSON must strictly follow this structure:

{
  "categories": 
    {
      "category": "CATEGORY",
      "description": "2-line description here",
      "cta_text": "Tap here to land CATEGORY page"
    }
  
}
Data to analyze: ${description}`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
    });
    
    return response?.text || null;
}

const fetchYoutubeData = (videoId) => {
    return new Promise((resolve, reject) => {
        getJson({
            engine: "youtube_video",
            v: videoId,
            api_key: process.env.SERPAPI_KEY
        }, (json) => {
            if (json.error) {
                reject(json.error);
            } else {
                resolve(json);
            }
        });
    });
};

export const generateData = async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        const { youtubeQuery } = req.body;
        if (!Array.isArray(youtubeQuery) || youtubeQuery.length === 0) {
            return res.status(400).json({ success: false, error: "youtubeQuery must be a non-empty array" });
        }

        console.log("Fetching data from SerpApi...");
        const results = await Promise.all(
            youtubeQuery.map(async (videoId) => {
                const data = await fetchYoutubeData(videoId);
                const description = data?.description?.content || "";

                let parsedAiData = null;
                if (description && description.trim() !== "") {
                    console.log("Generating AI Data...");
                    const generatedData = await generateAIData(ai, description);
                    if (generatedData) {
                        const cleanedString = generatedData
                            .replace(/^```json\s*/i, "") // Removes starting ```json
                            .replace(/```\s*$/, "")      // Removes ending ```
                            .trim();                     // Trims trailing whitespace
                        try {
                            parsedAiData = JSON.parse(cleanedString);
                        } catch {
                            parsedAiData = null;
                        }
                    }
                } else {
                    console.log("No description found to analyze.");
                }

                return { data, aiData: parsedAiData, deepLink: "" };
            })
        );

        return res.status(200).json({ success: true, results });

    } catch (error) {
        console.error("Error details:", error);
        return res.status(500).json({ success: false, error: error.message || "An error occurred while fetching data" });
    }
}