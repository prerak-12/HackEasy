import { GoogleGenAI } from "@google/genai";
import { getJson } from "serpapi";
import dummyDataById from "../constants/dummyLinks.js";

const getFallbackData = (videoId) => {
    const dummy = dummyDataById[videoId];
    if (dummy) {
        return {
            search_parameters: { engine: "youtube_video", v: videoId },
            title: dummy.title,
            thumbnail: dummy.thumbnail,
            description: dummy.description,
        };
    }

    return {
        search_parameters: { engine: "youtube_video", v: videoId },
        title: "PharmEasy Video",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        description: { content: "PharmEasy content." },
    };
};

const handleDeepLink = (category) => {
    switch (category) {
        case "LAB TESTS":
            return "push.pharmeasy.clevertap://deeplink/place_pathlab_order";

        case "MEDICINES":
            return "push.pharmeasy.clevertap://deeplink/medicine_otc_search?showAlert=true";

        case "HEART HEALTH":
            return "push.pharmeasy.clevertap://deeplink/open_web_view?url=https://pharmeasy.in/diag-pwa/content/hearthealth2";

        case "PHYSIO THERAPY":
            return "push.pharmeasy.clevertap://deeplink/open_web_view?url=https://pharmeasy.in/services/physiotherapy-2?iswebview=true&shouldCloseWebView=true&src=home_tile";

        case "DOCTOR CONSULT":
            return "push.pharmeasy.clevertap://deeplink/open_web_view?login_source=doctor-consultation&url=https://pharmeasy.in/doctor-consultation/landing?hideHeader=true&webview=true&src=home_tile";

        case "BRANDED SUBSTITUTE":
            return "push.pharmeasy.clevertap://deeplink/open_web_view?url=https://pharmeasy.in/generics?webview=true&hideHeader=true";

        default:
            return "push.pharmeasy.clevertap://deeplink/medicine_otc_search?showAlert=true";
    }
};

const categories = `
1) LAB TESTS,
2) MEDICINES,
3) HEART HEALTH,
4) PHYSIO THERAPY,
5) DOCTOR CONSULT,
6) BRANDED SUBSTITUTE
`;

const aiRules = `
Strictly follow these rules:
- Return ONLY valid JSON
- No markdown
- No explanation
- Category must exactly match one of the allowed categories
- Description should be maximum 2 lines

The JSON must very strictly follow this structure:
{
  "categories": {
    "category": "CATEGORY",
    "description": "SHORT DESCRIPTION",
    "cta_text": "Tap here to visit CATEGORY page"
  }
}
`;

const generateAIData = async (ai, description) => {
    const prompt = `Analyze this data and return a JSON object categorization. 
    Category can only be classified into these ${categories}
    One one category should be returned based on the data. The description is from a youtube video and may contain information about the video content, which can be used to determine the category.
    ${aiRules}
    Data to analyze: ${description}`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
    });
    
    return response?.text || null;
}

const isQuotaError = (error) => {
    const message = error?.message || "";
    return message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded") || message.includes("\"code\":429");
};

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
        let ai = null;
        try {
            ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
        } catch (initError) {
            console.error("Failed to initialize GoogleGenAI:", initError);
            ai = null;
        }

        const { youtubeQuery, useAi = true } = req.body;
        const ids = Array.isArray(youtubeQuery)
            ? youtubeQuery
            : youtubeQuery
                ? [youtubeQuery]
                : [];

        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: "youtubeQuery must be a non-empty array or string" });
        }

        const results = await Promise.all(
            ids.map(async (videoId) => {
                let data = null;
                try {
                    data = await fetchYoutubeData(videoId);
                } catch {
                    data = getFallbackData(videoId);
                }

                if (!data) {
                    data = getFallbackData(videoId);
                }
                const description = data?.description?.content || null;

                let parsedAiData = null;
                let deepLink = null;
                let isAiUsed = false;

                if (useAi && ai && description && description.trim() !== "") {
                    try {
                        const generatedData = await generateAIData(ai, description);
                        if (generatedData) {
                            const cleanedString = generatedData
                                .replace(/^```json\s*/i, "")
                                .replace(/```\s*$/, "")    
                                .trim();
                            try {
                                parsedAiData = JSON.parse(cleanedString);
                                deepLink = handleDeepLink(parsedAiData.categories.category);
                                isAiUsed = true;
                            } catch (parseErr) {
                                console.error("Failed to parse AI response for", videoId, parseErr);
                                parsedAiData = null;
                                deepLink = null;
                                isAiUsed = false;
                            }
                        }
                    } catch (error) {
                        console.error("AI error for", videoId, error);
                        // Always fallback on any AI error (quota or otherwise) so the
                        // overall batch doesn't fail. We'll set parsedAiData to null
                        // and continue to construct the fallback finalizedData below.
                        parsedAiData = null;
                        deepLink = null;
                        isAiUsed = false;
                    }
                }

                if (!parsedAiData) {
                    parsedAiData = {
                        categories: {
                            category: "MEDICINES",
                            description: data?.title?.trim() || "No description available",
                            cta_text: "Tap here to visit MEDICINES"
                        }
                    };
                    isAiUsed = false;
                    deepLink = handleDeepLink(parsedAiData.categories.category);
                }

                const finalizedData = {
                    title: data?.title,
                    description: parsedAiData?.categories?.description,
                    ctaText: parsedAiData?.categories?.cta_text,
                    thumbnail: data?.thumbnail || null,
                    ai_used: isAiUsed,
                    deepLink: deepLink,
                    category: parsedAiData?.categories?.category,
                };

                return finalizedData;
            })
        );

        return res.status(200).json({ success: true, results });

    } catch (error) {
        console.error("Error details:", error);
        return res.status(500).json({ success: false, error: error?.message || "An error occurred while fetching data" });
    }
}