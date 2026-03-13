const { getStore } = require("@netlify/blobs");

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

    if (event.httpMethod === "GET") {
          try {
                  const store = getStore("shipments");
                  const data = await store.get("all-shipments", { type: "json" });
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
                                  max_tokens: 4096,
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
                                                                          text: 'Extract every recipient shipping address from every label on every page of this PDF. For each label, return the recipient city and state (2-letter abbreviation). Return ONLY a JSON array of objects like [{"city": "Los Angeles", "state": "CA"}, ...]. If you cannot find any addresses, return an empty array []. Return ONLY valid JSON, no other text.',
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
                  console.log("Claude response:", responseText.substring(0, 500));

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
                                        body: JSON.stringify({
                                                      error: "Failed to parse Claude response",
                                                      raw: responseText,
                                        }),
                            };
                  }

            console.log("Parsed", locations.length, "locations");

            const store = getStore("shipments");
                  let existing;
                  try {
                            existing = await store.get("all-shipments", { type: "json" });
                  } catch (e) {
                            existing = null;
                  }

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

            await store.setJSON("all-shipments", existing);

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
