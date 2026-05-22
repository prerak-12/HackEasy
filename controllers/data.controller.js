const ENDPOINT = "https://serpapi.com/search.json?engine=youtube_video&v="

const generateData = async(req, res) => {
    try {
        const { query } = req.body;
        if( !query ) {
            return res.status(400).json({ success: false, error: "Query parameter is required" });
        }
        const url = ENDPOINT + query;
        const response = await fetch(url);
        const data = await response.json();

        
        
        res.status(200).json({ success: true, data });
    } catch (error ){
        res.status(404).json({ success: false, error: "An error occurred while fetching data" });
    }
}