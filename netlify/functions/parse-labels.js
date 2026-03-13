const SITE_ID = "38fdf165-05a7-4f65-9dc9-84333aac34eb";
const STORE_NAME = "shipments";
const KEY = "all-shipments";

async function blobGet(token) {
  try {
    const url = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/site:${STORE_NAME}/${KEY}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function blobSet(token, data) {
  const url = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/site:${STORE_NAME}/${KEY}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Blob write failed: " + resp.status + " " + errText);
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
  if (!NETLIFY_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "NETLIFY_TOKEN not configured" }),
    };
  }

  if (event.httpMethod === "GET") {
    try {
      const data = await blobGet(NETLIFY_TOKEN);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data || { shipments: [], shows: [] }),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ shipments: [], shows: [] }),
      };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      const { pdfBase64 } = body;

      console.log("POST received, pdfBase64 length:", pdfBase64 ? pdfBase64.length : "missing");

      if (!pdfBase64) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing pdfBase64 in request body" }),
        };
      }

      const now = new Date();
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const showName = months[now.getMonth()] + " " + now.getDate() + " " + now.getFullYear();

      const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
      if (!CLAUDE_API_KEY) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
        };
      }

      console.log("Calling Claude API...");

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: pdfBase64,
                  },
                },
                {
                  type: "text",
                  text: 'This PDF contains shipping labels. Extract the RECIPIENT city and state from EVERY SINGLE label on EVERY page. There may be dozens or hundreds of labels. Do NOT skip any. For each label, return the destination city and 2-letter state code. Return ONLY a JSON array like [{"city":"Los Angeles","state":"CA"},...]. No other text.',
                },
              ],
            },
          ],
        }),
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.log("Claude API error:", claudeResponse.status, errText.substring(0, 500));
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Claude API error: " + claudeResponse.status, details: errText }),
        };
      }

      const claudeData = await claudeResponse.json();
      const responseText = claudeData.content[0].text;
      console.log("Claude response length:", responseText.length);

      let locations = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          locations = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.log("Parse error:", parseErr.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to parse Claude response", raw: responseText }),
        };
      }

      console.log("Parsed", locations.length, "locations");

      let existing = await blobGet(NETLIFY_TOKEN);
      if (!existing) {
        existing = { shipments: [], shows: [] };
      }

      const timestamp = new Date().toISOString();

      if (!existing.shows.includes(showName)) {
        existing.shows.push(showName);
      }

      for (const loc of locations) {
        existing.shipments.push({
          city: loc.city,
          state: loc.state,
          show: showName,
          timestamp,
        });
      }

      await blobSet(NETLIFY_TOKEN, existing);

      console.log("Saved. Total shipments:", existing.shipments.length);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Labels parsed successfully",
          newLocations: locations,
          totalShipments: existing.shipments.length,
        }),
      };
    } catch (err) {
      console.log("Function error:", err.message, err.stack);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
