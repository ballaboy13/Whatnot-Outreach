(function () {
    const API_URL = "/api/parse-labels";
    let allData = { shipments: [], shows: [] };
    let currentFilter = "all";
    let projection, path, svg, g, mapWidth, mapHeight;
    let mapReady = false;

   const US_CITIES = {};

   async function loadCityCoords() {
         const resp = await fetch(
                 "https://gist.githubusercontent.com/Miserlou/c5cd8364bf9db202d03614d469613894/raw/2bf258763cdddd704f8ffd3ea9a3e81d25e2c6f6/cities.json"
               );
         const cities = await resp.json();
         for (const c of cities) {
                 const key = (c.city + ", " + c.state).toUpperCase();
                 US_CITIES[key] = { lat: parseFloat(c.latitude), lng: parseFloat(c.longitude) };
         }
   }

   function showStatus(msg, type) {
         const el = document.getElementById("status");
         el.textContent = msg;
         el.className = "status " + type;
   }

   function hideStatus() {
         document.getElementById("status").className = "status hidden";
   }

   function initMap() {
         const container = document.getElementById("map-container");
         mapWidth = container.clientWidth;
         mapHeight = container.clientHeight || window.innerHeight - 70;

      svg = d3
           .select("#map")
           .attr("width", mapWidth)
           .attr("height", mapHeight);

      projection = d3
           .geoAlbersUsa()
           .translate([mapWidth / 2, mapHeight / 2])
           .scale(mapWidth * 1.1);

      path = d3.geoPath().projection(projection);

      g = svg.append("g");

      d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(function (us) {
              g.selectAll("path")
                .data(topojson.feature(us, us.objects.states).features)
                .enter()
                .append("path")
                .attr("d", path)
                .attr("class", "state");

                                                                                    g.append("path")
                .datum(topojson.mesh(us, us.objects.states, function (a, b) {
                            return a !== b;
                }))
                .attr("fill", "none")
                .attr("stroke", "#ccc")
                .attr("stroke-width", "0.5px")
                .attr("d", path);

                                                                                    mapReady = true;
              loadExistingData();
      });

      const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", function (event) {
              g.attr("transform", event.transform);
      });
         svg.call(zoom);
   }

   async function loadExistingData() {
         try {
                 const resp = await fetch(API_URL);
                 if (resp.ok) {
                           const text = await resp.text();
                           if (text && text.trim().length > 0) {
                                       allData = JSON.parse(text);
                           }
                           if (!allData.shipments) allData.shipments = [];
                           if (!allData.shows) allData.shows = [];
                           updateShowFilter();
                           renderPins();
                           updateStats();
                 }
         } catch (e) {
                 console.log("No existing data yet", e);
         }
   }

   function updateShowFilter() {
         const select = document.getElementById("showFilter");
         const current = select.value;
         select.innerHTML = '<option value="all">All Shows</option>';
         for (const show of allData.shows) {
                 const opt = document.createElement("option");
                 opt.value = show;
                 opt.textContent = show;
                 select.appendChild(opt);
         }
         select.value = current || "all";
   }

   function getFilteredShipments() {
         if (currentFilter === "all") return allData.shipments;
         return allData.shipments.filter(function (s) {
                 return s.show === currentFilter;
         });
   }

   function renderPins() {
         if (!g) return;
         g.selectAll(".pin").remove();
         const shipments = getFilteredShipments();
         const cityMap = {};
         for (const s of shipments) {
                 const key = (s.city + ", " + s.state).toUpperCase();
                 if (!cityMap[key]) {
                           cityMap[key] = { city: s.city, state: s.state, count: 0, shows: [] };
                 }
                 cityMap[key].count++;
                 if (!cityMap[key].shows.includes(s.show)) {
                           cityMap[key].shows.push(s.show);
                 }
         }

      const tooltip = document.getElementById("tooltip");
         for (const [key, data] of Object.entries(cityMap)) {
                 const coords = US_CITIES[key];
                 if (!coords) continue;
                 const projected = projection([coords.lng, coords.lat]);
                 if (!projected) continue;

           const pinG = g
                   .append("g")
                   .attr("class", "pin")
                   .attr("transform", "translate(" + projected[0] + "," + projected[1] + ")");

           if (data.count === 1) {
                     pinG.append("circle").attr("r", 5).attr("class", "pin-dot");
           } else {
                     const r = Math.min(6 + Math.log2(data.count) * 4, 22);
                     pinG.append("circle").attr("r", r).attr("class", "pin-cluster");
                     pinG.append("text").attr("class", "pin-label").text(data.count);
           }

           pinG.on("mouseover", function (event) {
                     const showList = data.shows.join(", ");
                     tooltip.innerHTML =
                                 "<h4>" + data.city + ", " + data.state + "</h4>" +
                                 "<p>" + data.count + " shipment" + (data.count > 1 ? "s" : "") + "</p>" +
                                 "<p>Shows: " + showList + "</p>";
                     tooltip.className = "tooltip";
                     tooltip.style.left = event.offsetX + 12 + "px";
                     tooltip.style.top = event.offsetY - 10 + "px";
           });
                 pinG.on("mouseout", function () {
                           tooltip.className = "tooltip hidden";
                 });
         }
   }

   function updateStats() {
         const shipments = getFilteredShipments();
         const cities = new Set();
         const states = new Set();
         const cityCount = {};
         for (const s of shipments) {
                 const cityKey = s.city + ", " + s.state;
                 cities.add(cityKey);
                 states.add(s.state);
                 cityCount[cityKey] = (cityCount[cityKey] || 0) + 1;
         }
         document.getElementById("totalShipments").textContent = shipments.length;
         document.getElementById("totalCities").textContent = cities.size;
         document.getElementById("totalStates").textContent = states.size;

      const sorted = Object.entries(cityCount)
           .sort(function (a, b) { return b[1] - a[1]; })
           .slice(0, 10);
         const topList = document.getElementById("topCities");
         topList.innerHTML = "";
         for (const [city, count] of sorted) {
                 const li = document.createElement("li");
                 li.innerHTML = city + " <span>(" + count + ")</span>";
                 topList.appendChild(li);
         }
   }

   function fileToBase64(file) {
         return new Promise(function (resolve, reject) {
                 const reader = new FileReader();
                 reader.onload = function () {
                           const base64 = reader.result.split(",")[1];
                           resolve(base64);
                 };
                 reader.onerror = reject;
                 reader.readAsDataURL(file);
         });
   }

   async function handleUpload(file) {
         showStatus("Uploading and parsing labels... This may take a minute.", "loading");
         try {
                 const base64 = await fileToBase64(file);
                 const resp = await fetch(API_URL, {
                           method: "POST",
                           headers: { "Content-Type": "application/json" },
                           body: JSON.stringify({ pdfBase64: base64 }),
                 });
                 const text = await resp.text();
                 let result;
                 try {
                           result = JSON.parse(text);
                 } catch (parseErr) {
                           showStatus("Upload failed: Invalid response from server.", "error");
                           return;
                 }
                 if (!resp.ok) {
                           showStatus("Error: " + (result.error || "Unknown error"), "error");
                           return;
                 }
                 showStatus(
                           "Success! Parsed " + result.newLocations.length + " locations. Total: " + result.totalShipments + " shipments.",
                           "success"
                         );
                 await loadExistingData();
                 setTimeout(hideStatus, 5000);
         } catch (err) {
                 showStatus("Upload failed: " + err.message, "error");
         }
   }

   document.getElementById("pdfUpload").addEventListener("change", function (e) {
         const file = e.target.files[0];
         if (file) {
                 handleUpload(file);
                 e.target.value = "";
         }
   });

   document.getElementById("showFilter").addEventListener("change", function (e) {
         currentFilter = e.target.value;
         renderPins();
         updateStats();
   });

   window.addEventListener("resize", function () {
         if (!svg || !mapReady) return;
         const container = document.getElementById("map-container");
         mapWidth = container.clientWidth;
         mapHeight = container.clientHeight || window.innerHeight - 70;
         svg.attr("width", mapWidth).attr("height", mapHeight);
         projection.translate([mapWidth / 2, mapHeight / 2]).scale(mapWidth * 1.1);
         path = d3.geoPath().projection(projection);
         g.selectAll(".state").attr("d", path);
         renderPins();
   });

   loadCityCoords().then(initMap);
})();
