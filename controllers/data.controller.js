// import puter from "@heyputer/puter.js";
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
    
    // The SDK wraps the text inside a response object helper
    return response?.text || null;
}

// Helper function to turn SerpApi callback into a Promise
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
        if (!youtubeQuery) {
            return res.status(400).json({ success: false, error: "Query parameter is required" });
        }

        console.log("Fetching data from SerpApi...");
        const data = await fetchYoutubeData(youtubeQuery);
        
        const description = data?.description?.content || "";
        let generatedData = null;

        if (description && description.trim() !== "") {
            console.log("Generating AI Data...");
            generatedData = await generateAIData(ai, description);
        } else {
            console.log("No description found to analyze.");
        }

        const cleanedString = generatedData
            .replace(/^```json\s*/i, "") // Removes starting ```json
            .replace(/```\s*$/, "")      // Removes ending ```
            .trim();                     // Trims trailing whitespace
            
        const parsedAiData = JSON.parse(cleanedString);
        
        return res.status(200).json({ success: true, data: data, aiData: parsedAiData });

    } catch (error) {
        console.error("Error details:", error);
        return res.status(500).json({ success: false, error: error.message || "An error occurred while fetching data" });
    }
}