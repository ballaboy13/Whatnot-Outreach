exports.handler = async (event) => {
    const headers = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
          return { statusCode: 204, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
          return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    try {
          const body = JSON.parse(event.body);
          const { pdfBase64 } = body;
          console.log("POST received, pdfBase64 length:", pdfBase64 ? pdfBase64.length : "missing");

      if (!pdfBase64) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing pdfBase64" }) };
      }

      const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
          if (!CLAUDE_API_KEY) {
                  return { statusCode: 500, headers, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
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
                                                                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
                                              },
                                              {
                                                                type: "text",
                                                                text: 'This PDF contains shipping labels. Extract the RECIPIENT (destination/ship-to) city and state from EVERY SINGLE label on EVERY page. There may be dozens or hundreds of labels. Do NOT skip any. Go through every page carefully. For each label, return the destination city and 2-letter state code. Return ONLY a JSON array like [{"city":"Los Angeles","state":"CA"},...]. No other text.',
                                              },
                                                          ],
                              },
                                      ],
                  }),
          });

      if (!claudeResponse.ok) {
              const errText = await claudeResponse.text();
              console.log("Claude API error:", claudeResponse.status, errText.substring(0, 500));
              return { statusCode: 500, headers, body: JSON.stringify({ error: "Claude API error: " + claudeResponse.status }) };
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
                  return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to parse Claude response" }) };
          }

      console.log("Parsed", locations.length, "locations");

      return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ locations: locations }),
      };
    } catch (err) {
          console.log("Function error:", err.message, err.stack);
          return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
