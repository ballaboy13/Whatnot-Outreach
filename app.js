(function () {
              var API_URL = "/api/parse-labels";
              var STORAGE_KEY = "whatnot-outreach-data";
              var BATCH_SIZE = 10;
              var allData = { shipments: [], shows: [] };
              var currentFilter = "all";
              var projection, path, svg, g, mapWidth, mapHeight;
              var mapReady = false;
              var US_CITIES = {};
              pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

   function saveData() {
                   try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allData)); } catch (e) {}
   }

   function loadData() {
                   try {
                                     var saved = localStorage.getItem(STORAGE_KEY);
                                     if (saved) {
                                                         allData = JSON.parse(saved);
                                                         if (!allData.shipments) allData.shipments = [];
                                                         if (!allData.shows) allData.shows = [];
                                     }
                   } catch (e) {}
   }

   async function loadCityCoords() {
                   try {
                                     var resp = await fetch("https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv");
                                     var text = await resp.text();
                                     var lines = text.split("\n");
                                     for (var i = 1; i < lines.length; i++) {
                                                         var line = lines[i].trim();
                                                         if (!line) continue;
                                                         var parts = [], current = "", inQuotes = false;
                                                         for (var j = 0; j < line.length; j++) {
                                                                               if (line[j] === '"') { inQuotes = !inQuotes; }
                                                                               else if (line[j] === ',' && !inQuotes) { parts.push(current); current = ""; }
                                                                               else { current += line[j]; }
                                                         }
                                                         parts.push(current);
                                                         if (parts.length >= 7) {
                                                                               var sc = parts[1], ci = parts[3], la = parseFloat(parts[5]), ln = parseFloat(parts[6]);
                                                                               if (ci && sc && !isNaN(la) && !isNaN(ln)) US_CITIES[(ci + ", " + sc).toUpperCase()] = { lat: la, lng: ln };
                                                         }
                                     }
                   } catch (e) { console.log("City coords error", e); }
   }

   function showStatus(msg, type) {
                   var el = document.getElementById("status");
                   el.textContent = msg;
                   el.className = "status " + type;
   }

   function hideStatus() {
                   document.getElementById("status").className = "status hidden";
   }

   function getMapDimensions() {
                   var container = document.getElementById("map-container");
                   return { w: container.clientWidth, h: container.clientHeight };
   }

   function initMap() {
                   var dims = getMapDimensions();
                   mapWidth = dims.w;
                   mapHeight = dims.h;
                   svg = d3.select("#map");
                   projection = d3.geoAlbersUsa().translate([mapWidth / 2, mapHeight / 2]).scale(mapWidth * 1.1);
                   path = d3.geoPath().projection(projection);
                   g = svg.append("g");

                d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(function (us) {
                                  g.selectAll("path").data(topojson.feature(us, us.objects.states).features).enter().append("path").attr("d", path).attr("class", "state");
                                  g.append("path").datum(topojson.mesh(us, us.objects.states, function (a, b) { return a !== b; })).attr("fill", "none").attr("stroke", "#ccc").attr("stroke-width", "0.5px").attr("d", path);
                                  mapReady = true;
                                  loadData();
                                  updateShowFilter();
                                  renderPins();
                                  updateStats();
                });

                svg.call(d3.zoom().scaleExtent([1, 8]).on("zoom", function (event) {
                                  g.attr("transform", event.transform);
                }));
   }

   function updateShowFilter() {
                   var select = document.getElementById("showFilter");
                   var cur = select.value;
                   select.innerHTML = '<option value="all">All Shows</option>';
                   for (var i = 0; i < allData.shows.length; i++) {
                                     var opt = document.createElement("option");
                                     opt.value = allData.shows[i];
                                     opt.textContent = allData.shows[i];
                                     select.appendChild(opt);
                   }
                   select.value = cur || "all";
   }

   function getFilteredShipments() {
                   if (currentFilter === "all") return allData.shipments;
                   return allData.shipments.filter(function (s) { return s.show === currentFilter; });
   }

   function renderPins() {
                   if (!g) return;
                   g.selectAll(".pin").remove();
                   var shipments = getFilteredShipments();
                   var cityMap = {};
                   for (var i = 0; i < shipments.length; i++) {
                                     var s = shipments[i], key = (s.city + ", " + s.state).toUpperCase();
                                     if (!cityMap[key]) cityMap[key] = { city: s.city, state: s.state, count: 0 };
                                     cityMap[key].count++;
                   }
                   var entries = Object.entries(cityMap);
                   for (var j = 0; j < entries.length; j++) {
                                     var k = entries[j][0], data = entries[j][1];
                                     var coords = US_CITIES[k];
                                     if (!coords) continue;
                                     var projected = projection([coords.lng, coords.lat]);
                                     if (!projected) continue;
                                     var r = Math.min(1.5 + Math.log2(data.count) * 0.8, 5);
                                     g.append("circle")
                                       .attr("class", "pin")
                                       .attr("cx", projected[0])
                                       .attr("cy", projected[1])
                                       .attr("r", r)
                                       .attr("fill", "rgba(255, 90, 50, 0.7)")
                                       .attr("stroke", "none");
                   }
   }

   function updateStats() {
                   var shipments = getFilteredShipments();
                   var cities = {}, states = {}, cityCount = {};
                   for (var i = 0; i < shipments.length; i++) {
                                     var s = shipments[i], ck = s.city + ", " + s.state;
                                     cities[ck] = true;
                                     states[s.state] = true;
                                     cityCount[ck] = (cityCount[ck] || 0) + 1;
                   }
                   document.getElementById("totalShipments").textContent = shipments.length;
                   document.getElementById("totalCities").textContent = Object.keys(cities).length;
                   document.getElementById("totalStates").textContent = Object.keys(states).length;
                   var sorted = Object.entries(cityCount).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
                   var topList = document.getElementById("topCities");
                   topList.innerHTML = "";
                   for (var j = 0; j < sorted.length; j++) {
                                     var li = document.createElement("li");
                                     li.innerHTML = sorted[j][0] + " <span>(" + sorted[j][1] + ")</span>";
                                     topList.appendChild(li);
                   }
   }

   async function pdfToPageImages(file) {
                   var arrayBuffer = await file.arrayBuffer();
                   var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                   var totalPages = pdf.numPages;
                   var canvas = document.getElementById("pdfCanvas");
                   var ctx = canvas.getContext("2d");
                   var images = [];
                   for (var p = 1; p <= totalPages; p++) {
                                     var page = await pdf.getPage(p);
                                     var viewport = page.getViewport({ scale: 1.5 });
                                     canvas.width = viewport.width;
                                     canvas.height = viewport.height;
                                     await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                                     images.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
                   }
                   return images;
   }

   async function sendBatch(batch, batchNum, totalBatches) {
                   showStatus("Processing batch " + batchNum + " of " + totalBatches + "...", "loading");
                   var resp = await fetch(API_URL, {
                                     method: "POST",
                                     headers: { "Content-Type": "application/json" },
                                     body: JSON.stringify({ images: batch })
                   });
                   var respText = await resp.text();
                   if (!respText || respText.trim().length === 0) throw new Error("Empty response on batch " + batchNum);
                   var result = JSON.parse(respText);
                   if (!resp.ok) throw new Error(result.error || "Batch " + batchNum + " failed");
                   return result.locations || [];
   }

   async function handleUpload(file) {
                   try {
                                     showStatus("Reading PDF pages...", "loading");
                                     var allImages = await pdfToPageImages(file);
                                     if (allImages.length === 0) { showStatus("No pages found.", "error"); return; }
                                     var totalBatches = Math.ceil(allImages.length / BATCH_SIZE);
                                     var allLocations = [];
                                     for (var b = 0; b < totalBatches; b++) {
                                                         var start = b * BATCH_SIZE, end = Math.min(start + BATCH_SIZE, allImages.length);
                                                         showStatus("Processing pages " + (start+1) + "-" + end + " of " + allImages.length + " (batch " + (b+1) + "/" + totalBatches + ")", "loading");
                                                         var locs = await sendBatch(allImages.slice(start, end), b+1, totalBatches);
                                                         allLocations = allLocations.concat(locs);
                                     }
                                     if (allLocations.length === 0) { showStatus("No addresses found.", "error"); return; }
                                     var now = new Date();
                                     var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                                     var showName = months[now.getMonth()] + " " + now.getDate() + " " + now.getFullYear();
                                     var ts = now.toISOString();
                                     if (!allData.shows.includes(showName)) allData.shows.push(showName);
                                     for (var i = 0; i < allLocations.length; i++) {
                                                         allData.shipments.push({ city: allLocations[i].city, state: allLocations[i].state, show: showName, timestamp: ts });
                                     }
                                     saveData();
                                     updateShowFilter();
                                     renderPins();
                                     updateStats();
                                     showStatus("Found " + allLocations.length + " addresses from " + allImages.length + " pages. Total: " + allData.shipments.length, "success");
                                     setTimeout(hideStatus, 8000);
                   } catch (err) {
                                     console.error("Upload error:", err);
                                     showStatus("Error: " + err.message, "error");
                   }
   }

   document.getElementById("pdfUpload").addEventListener("change", function (e) {
                   var file = e.target.files[0];
                   if (file) { handleUpload(file); e.target.value = ""; }
   });

   document.getElementById("showFilter").addEventListener("change", function (e) {
                   currentFilter = e.target.value;
                   renderPins();
                   updateStats();
   });

   window.addEventListener("resize", function () {
                   if (!svg || !mapReady) return;
                   var dims = getMapDimensions();
                   mapWidth = dims.w;
                   mapHeight = dims.h;
                   projection.translate([mapWidth / 2, mapHeight / 2]).scale(mapWidth * 1.1);
                   path = d3.geoPath().projection(projection);
                   g.selectAll(".state").attr("d", path);
                   renderPins();
   });

   loadCityCoords().then(initMap);
})();
