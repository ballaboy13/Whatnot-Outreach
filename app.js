(function () {
              var API_URL = "/api/parse-labels";
              var STORAGE_KEY = "whatnot-outreach-data";
              var BATCH_SIZE = 10;
              var allData = { shipments: [], shows: [], uploadedHashes: [] };
              var currentFilter = "all";
              var projection, path, svg, g, mapWidth, mapHeight;
              var mapReady = false;
              var US_CITIES = {};
              var zoomBehavior;
              var heatMode = false;
              var selectedState = null;
              var modalSortCol = "count";
              var modalSortAsc = false;
              var ALL_STATE_CODES = [
                              "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
                              "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
                              "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
                              "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
                              "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
                            ];

   pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

   async function computeFileHash(file) {
                   var buffer = await file.arrayBuffer();
                   var hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                   var hashArray = Array.from(new Uint8Array(hashBuffer));
                   return hashArray.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
   }

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
                                                         if (!allData.uploadedHashes) allData.uploadedHashes = [];
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

   function showProgress(percent, text) {
                   var container = document.getElementById("uploadProgress");
                   var fill = document.getElementById("progressFill");
                   var label = document.getElementById("progressText");
                   container.classList.remove("hidden");
                   container.setAttribute("aria-valuenow", Math.round(percent));
                   fill.style.width = percent + "%";
                   label.textContent = text || "Processing...";
   }

   function hideProgress() {
                   document.getElementById("uploadProgress").classList.add("hidden");
   }

   function checkEmptyState() {
                   var el = document.getElementById("emptyState");
                   if (allData.shipments.length === 0) {
                                     el.classList.remove("hidden");
                   } else {
                                     el.classList.add("hidden");
                   }
   }

   function getContainerDimensions() {
                   var container = document.getElementById("map-container");
                   var rect = container.getBoundingClientRect();
                   return { width: Math.floor(rect.width), height: Math.floor(rect.height) };
   }

   function updateMapDimensions() {
                   var dims = getContainerDimensions();
                   mapWidth = dims.width;
                   mapHeight = dims.height;
                   if (mapWidth <= 0 || mapHeight <= 0) return false;
                   svg.attr("viewBox", "0 0 " + mapWidth + " " + mapHeight);
                   projection.translate([mapWidth / 2, mapHeight / 2]).scale(Math.min(mapWidth, mapHeight * 1.6) * 1.1);
                   path = d3.geoPath().projection(projection);
                   return true;
   }

   /* ---- STATE NAME LOOKUP ---- */
   var stateFeatures = {};
              var stateFipsToCode = {
                              "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
                              "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
                              "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
                              "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
                              "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
                              "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
                              "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
                              "55":"WI","56":"WY"
              };
              var stateCodeToName = {
                              "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California",
                              "CO":"Colorado","CT":"Connecticut","DE":"Delaware","DC":"District of Columbia",
                              "FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois",
                              "IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana",
                              "ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota",
                              "MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada",
                              "NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York",
                              "NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma",
                              "OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina",
                              "SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont",
                              "VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"
              };

   function getStateCode(feature) {
                   var fips = feature.id ? String(feature.id).padStart(2, "0") : "";
                   return stateFipsToCode[fips] || "";
   }

   /* ---- TOOLTIP ---- */
   function showTooltip(html, event) {
                   var tip = document.getElementById("tooltip");
                   tip.innerHTML = html;
                   tip.classList.remove("hidden");
                   var container = document.getElementById("map-container");
                   var rect = container.getBoundingClientRect();
                   var x = event.clientX - rect.left + 14;
                   var y = event.clientY - rect.top - 10;
                   if (x + 220 > rect.width) x = x - 240;
                   if (y + 80 > rect.height) y = y - 80;
                   tip.style.left = x + "px";
                   tip.style.top = y + "px";
   }

   function hideTooltip() {
                   var tip = document.getElementById("tooltip");
                   tip.classList.add("hidden");
   }

   /* ---- MAP INIT ---- */
   function initMap() {
                   var dims = getContainerDimensions();
                   mapWidth = dims.width || 960;
                   mapHeight = dims.height || 600;
                   svg = d3.select("#map")
                     .attr("viewBox", "0 0 " + mapWidth + " " + mapHeight)
                     .attr("preserveAspectRatio", "xMidYMid meet");
                   projection = d3.geoAlbersUsa().translate([mapWidth / 2, mapHeight / 2]).scale(Math.min(mapWidth, mapHeight * 1.6) * 1.1);
                   path = d3.geoPath().projection(projection);
                   g = svg.append("g");

                zoomBehavior = d3.zoom().scaleExtent([1, 8]).on("zoom", function (event) {
                                  g.attr("transform", event.transform);
                });
                   svg.call(zoomBehavior);

                d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(function (us) {
                                  var features = topojson.feature(us, us.objects.states).features;
                                  g.selectAll("path")
                                    .data(features)
                                    .enter().append("path")
                                    .attr("d", path)
                                    .attr("class", "state")
                                    .on("click", function (event, d) {
                                                          var code = getStateCode(d);
                                                          if (code) handleStateClick(code);
                                    })
                                    .on("mouseover", function (event, d) {
                                                          var code = getStateCode(d);
                                                          var name = stateCodeToName[code] || code;
                                                          var shipments = getFilteredShipments();
                                                          var count = 0;
                                                          for (var i = 0; i < shipments.length; i++) {
                                                                                  if (shipments[i].state === code) count++;
                                                          }
                                                          showTooltip("<h4>" + name + "</h4><p>" + count + " shipment" + (count !== 1 ? "s" : "") + "</p>", event);
                                    })
                                    .on("mousemove", function (event) {
                                                          showTooltip(document.getElementById("tooltip").innerHTML, event);
                                    })
                                    .on("mouseout", hideTooltip);

                                                                                              features.forEach(function (f) {
                                                                                                                  var code = getStateCode(f);
                                                                                                                  if (code) stateFeatures[code] = f;
                                                                                                          });

                                                                                              g.append("path")
                                    .datum(topojson.mesh(us, us.objects.states, function (a, b) { return a !== b; }))
                                    .attr("fill", "none").attr("stroke", "#ccc").attr("stroke-width", "0.5px").attr("d", path);

                                                                                              mapReady = true;
                                  loadData();
                                  updateShowFilter();
                                  renderPins();
                                  updateStats();
                                  checkEmptyState();
                });

                /* Zoom button handlers */
                document.getElementById("zoomIn").addEventListener("click", function () {
                                  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.5);
                });
                   document.getElementById("zoomOut").addEventListener("click", function () {
                                     svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.67);
                   });
                   document.getElementById("zoomReset").addEventListener("click", function () {
                                     svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
                   });
   }

   /* ---- STATE CLICK DRILL DOWN ---- */
   function handleStateClick(code) {
                   if (selectedState === code) {
                                     clearStateSelection();
                                     return;
                   }
                   selectedState = code;
                   g.selectAll(".state").classed("active", function (d) {
                                     return getStateCode(d) === code;
                   });
                   showStateDetail(code);
   }

   function clearStateSelection() {
                   selectedState = null;
                   g.selectAll(".state").classed("active", false);
                   document.getElementById("stateDetail").classList.add("hidden");
   }

   function showStateDetail(code) {
                   var name = stateCodeToName[code] || code;
                   var shipments = getFilteredShipments();
                   var cities = {}, total = 0;
                   for (var i = 0; i < shipments.length; i++) {
                                     if (shipments[i].state === code) {
                                                         total++;
                                                         var ck = shipments[i].city + ", " + shipments[i].state;
                                                         cities[ck] = (cities[ck] || 0) + 1;
                                     }
                   }
                   var sorted = Object.entries(cities).sort(function (a, b) { return b[1] - a[1]; });
                   document.getElementById("stateDetailTitle").textContent = name + " (" + code + ")";
                   document.getElementById("stateShipments").textContent = total;
                   document.getElementById("stateCities").textContent = sorted.length;
                   var list = document.getElementById("stateCityList");
                   list.innerHTML = "";
                   for (var j = 0; j < sorted.length; j++) {
                                     var li = document.createElement("li");
                                     li.innerHTML = sorted[j][0] + ' <span>(' + sorted[j][1] + ')</span>';
                                     list.appendChild(li);
                   }
                   document.getElementById("stateDetail").classList.remove("hidden");
   }

   /* ---- SHOW FILTER ---- */
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

   /* ---- RENDER PINS ---- */
   function getCityMap() {
                   var shipments = getFilteredShipments();
                   var cityMap = {};
                   for (var i = 0; i < shipments.length; i++) {
                                     var s = shipments[i], key = (s.city + ", " + s.state).toUpperCase();
                                     if (!cityMap[key]) cityMap[key] = { city: s.city, state: s.state, count: 0 };
                                     cityMap[key].count++;
                   }
                   return cityMap;
   }

   function renderPins() {
                   if (!g) return;
                   g.selectAll(".pin").remove();
                   var cityMap = getCityMap();
                   var entries = Object.entries(cityMap);
                   var maxCount = 1;
                   for (var j = 0; j < entries.length; j++) {
                                     if (entries[j][1].count > maxCount) maxCount = entries[j][1].count;
                   }

                for (var k = 0; k < entries.length; k++) {
                                  var key = entries[k][0], data = entries[k][1];
                                  var coords = US_CITIES[key];
                                  if (!coords) continue;
                                  var projected = projection([coords.lng, coords.lat]);
                                  if (!projected) continue;
                                  var r, fill;
                                  if (heatMode) {
                                                      var ratio = data.count / maxCount;
                                                      r = Math.max(3, ratio * 12);
                                                      var r_col = Math.round(255);
                                                      var g_col = Math.round(90 + (1 - ratio) * 120);
                                                      var b_col = Math.round(50 * (1 - ratio));
                                                      fill = "rgba(" + r_col + "," + g_col + "," + b_col + "," + (0.4 + ratio * 0.5) + ")";
                                  } else {
                                                      r = Math.min(1.5 + Math.log2(data.count) * 0.8, 5);
                                                      fill = "rgba(255, 90, 50, 0.7)";
                                  }

                     (function(pinData, pinKey) {
                                         g.append("circle")
                                           .attr("class", "pin")
                                           .attr("cx", projected[0])
                                           .attr("cy", projected[1])
                                           .attr("r", r)
                                           .attr("fill", fill)
                                           .attr("stroke", "none")
                                           .on("mouseover", function (event) {
                                                                   d3.select(this).attr("stroke", "#1a5276").attr("stroke-width", 1.5);
                                                                   showTooltip(
                                                                                             '<h4>' + pinData.city + ', ' + pinData.state + '</h4>' +
                                                                                             '<p class="tooltip-count">' + pinData.count + ' shipment' + (pinData.count !== 1 ? 's' : '') + '</p>',
                                                                                             event
                                                                                           );
                                           })
                                           .on("mousemove", function (event) {
                                                                   showTooltip(document.getElementById("tooltip").innerHTML, event);
                                           })
                                           .on("mouseout", function () {
                                                                   d3.select(this).attr("stroke", "none");
                                                                   hideTooltip();
                                           })
                                           .on("click", function (event) {
                                                                   event.stopPropagation();
                                                                   var c = US_CITIES[pinKey];
                                                                   if (c) {
                                                                                             var p = projection([c.lng, c.lat]);
                                                                                             if (p) {
                                                                                                                         svg.transition().duration(500).call(
                                                                                                                                                       zoomBehavior.transform,
                                                                                                                                                       d3.zoomIdentity.translate(mapWidth/2, mapHeight/2).scale(4).translate(-p[0], -p[1])
                                                                                                                                                     );
                                                                                                         }
                                                                   }
                                           });
                     })(data, key);
                }
   }

   /* ---- STATS ---- */
   function updateStats() {
                   var shipments = getFilteredShipments();
                   var cities = {}, states = {}, cityCount = {};
                   for (var i = 0; i < shipments.length; i++) {
                                     var s = shipments[i], ck = s.city + ", " + s.state;
                                     cities[ck] = true;
                                     states[s.state] = true;
                                     cityCount[ck] = (cityCount[ck] || 0) + 1;
                   }

                var uniqueStates = Object.keys(states);
                   var missingCount = 0;
                   for (var m = 0; m < ALL_STATE_CODES.length; m++) {
                                     if (uniqueStates.indexOf(ALL_STATE_CODES[m]) === -1) missingCount++;
                   }

                document.getElementById("totalShipments").textContent = shipments.length;
                   document.getElementById("totalCities").textContent = Object.keys(cities).length;
                   document.getElementById("totalStates").textContent = uniqueStates.length;
                   document.getElementById("missingStates").textContent = missingCount;

                var sorted = Object.entries(cityCount).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
                   var topList = document.getElementById("topCities");
                   topList.innerHTML = "";
                   for (var j = 0; j < sorted.length; j++) {
                                     var li = document.createElement("li");
                                     li.innerHTML = sorted[j][0] + " <span>(" + sorted[j][1] + ")</span>";
                                     topList.appendChild(li);
                   }

                if (selectedState) showStateDetail(selectedState);
                   checkEmptyState();
   }

   /* ---- EXPORT CSV ---- */
   function exportCSV() {
                   var cityMap = getCityMap();
                   var entries = Object.entries(cityMap);
                   entries.sort(function (a, b) { return b[1].count - a[1].count; });
                   var csv = "City,State,Shipments\n";
                   for (var i = 0; i < entries.length; i++) {
                                     var d = entries[i][1];
                                     csv += '"' + d.city + '","' + d.state + '",' + d.count + "\n";
                   }
                   var blob = new Blob([csv], { type: "text/csv" });
                   var url = URL.createObjectURL(blob);
                   var a = document.createElement("a");
                   a.href = url;
                   a.download = "whatnot-outreach-" + (currentFilter === "all" ? "all-shows" : currentFilter.replace(/\s/g, "-")) + ".csv";
                   document.body.appendChild(a);
                   a.click();
                   document.body.removeChild(a);
                   URL.revokeObjectURL(url);
   }

   /* ---- ALL DESTINATIONS MODAL ---- */
   function openModal() {
                   var modal = document.getElementById("allDestModal");
                   modal.classList.remove("hidden");
                   document.getElementById("destSearch").value = "";
                   renderModalTable();
                   document.getElementById("destSearch").focus();
   }

   function closeModal() {
                   document.getElementById("allDestModal").classList.add("hidden");
   }

   function renderModalTable(filter) {
                   var cityMap = getCityMap();
                   var entries = Object.entries(cityMap).map(function (e) {
                                     return { key: e[0], city: e[1].city, state: e[1].state, count: e[1].count };
                   });
                   if (filter) {
                                     var f = filter.toLowerCase();
                                     entries = entries.filter(function (e) {
                                                         return e.city.toLowerCase().indexOf(f) !== -1 || e.state.toLowerCase().indexOf(f) !== -1;
                                     });
                   }
                   entries.sort(function (a, b) {
                                     var va, vb;
                                     if (modalSortCol === "city") { va = a.city.toLowerCase(); vb = b.city.toLowerCase(); }
                                     else if (modalSortCol === "state") { va = a.state; vb = b.state; }
                                     else if (modalSortCol === "count") { va = a.count; vb = b.count; }
                                     else { va = 0; vb = 0; }
                                     if (va < vb) return modalSortAsc ? -1 : 1;
                                     if (va > vb) return modalSortAsc ? 1 : -1;
                                     return 0;
                   });

                var ths = document.querySelectorAll("#destTable th");
                   ths.forEach(function (th) {
                                     th.classList.remove("sort-asc", "sort-desc");
                                     if (th.dataset.sort === modalSortCol) {
                                                         th.classList.add(modalSortAsc ? "sort-asc" : "sort-desc");
                                     }
                   });

                var tbody = document.getElementById("destTableBody");
                   tbody.innerHTML = "";
                   for (var i = 0; i < entries.length; i++) {
                                     var tr = document.createElement("tr");
                                     tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + entries[i].city + "</td><td>" + entries[i].state + "</td><td>" + entries[i].count + "</td>";
                                     tbody.appendChild(tr);
                   }
   }

   /* ---- PDF PROCESSING ---- */
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
                                     showProgress((p / totalPages) * 40, "Reading page " + p + " of " + totalPages + "...");
                   }
                   return images;
   }

   async function sendBatch(batch, batchNum, totalBatches) {
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
                                     showProgress(0, "Checking for duplicates...");
                                     showStatus("Checking for duplicates...", "loading");
                                     var fileHash = await computeFileHash(file);
                                     if (allData.uploadedHashes.indexOf(fileHash) !== -1) {
                                                         hideProgress();
                                                         showStatus("This PDF has already been uploaded. Skipping to prevent duplicates.", "error");
                                                         setTimeout(hideStatus, 6000);
                                                         return;
                                     }

                     showProgress(5, "Reading PDF pages...");
                                     showStatus("Reading PDF pages...", "loading");
                                     var allImages = await pdfToPageImages(file);
                                     if (allImages.length === 0) {
                                                         hideProgress();
                                                         showStatus("No pages found.", "error");
                                                         return;
                                     }

                     var totalBatches = Math.ceil(allImages.length / BATCH_SIZE);
                                     var allLocations = [];
                                     for (var b = 0; b < totalBatches; b++) {
                                                         var start = b * BATCH_SIZE, end = Math.min(start + BATCH_SIZE, allImages.length);
                                                         var batchPercent = 40 + ((b + 1) / totalBatches) * 55;
                                                         showProgress(batchPercent, "Processing pages " + (start + 1) + "-" + end + " of " + allImages.length);
                                                         showStatus("Processing pages " + (start + 1) + "-" + end + " of " + allImages.length + " (batch " + (b + 1) + "/" + totalBatches + ")", "loading");
                                                         var locs = await sendBatch(allImages.slice(start, end), b + 1, totalBatches);
                                                         allLocations = allLocations.concat(locs);
                                     }

                     if (allLocations.length === 0) {
                                         hideProgress();
                                         showStatus("No addresses found.", "error");
                                         return;
                     }

                     showProgress(98, "Saving data...");
                                     var now = new Date();
                                     var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                                     var showName = months[now.getMonth()] + " " + now.getDate() + " " + now.getFullYear();
                                     var ts = now.toISOString();
                                     if (!allData.shows.includes(showName)) allData.shows.push(showName);
                                     for (var i = 0; i < allLocations.length; i++) {
                                                         allData.shipments.push({ city: allLocations[i].city, state: allLocations[i].state, show: showName, timestamp: ts });
                                     }
                                     allData.uploadedHashes.push(fileHash);
                                     saveData();
                                     updateShowFilter();
                                     renderPins();
                                     updateStats();
                                     showProgress(100, "Done!");
                                     showStatus("Found " + allLocations.length + " addresses from " + allImages.length + " pages. Total: " + allData.shipments.length, "success");
                                     setTimeout(function () { hideProgress(); hideStatus(); }, 5000);
                   } catch (err) {
                                     console.error("Upload error:", err);
                                     hideProgress();
                                     showStatus("Error: " + err.message, "error");
                   }
   }

   /* ---- EVENT LISTENERS ---- */
   document.getElementById("pdfUpload").addEventListener("change", function (e) {
                   var file = e.target.files[0];
                   if (file) { handleUpload(file); e.target.value = ""; }
   });

   document.getElementById("showFilter").addEventListener("change", function (e) {
                   currentFilter = e.target.value;
                   renderPins();
                   updateStats();
   });

   document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

   document.getElementById("heatToggleBtn").addEventListener("click", function () {
                   heatMode = !heatMode;
                   this.classList.toggle("active", heatMode);
                   this.textContent = heatMode ? "Normal" : "Heat Map";
                   renderPins();
   });

   document.getElementById("showAllBtn").addEventListener("click", openModal);
              document.getElementById("closeModal").addEventListener("click", closeModal);
              document.getElementById("clearStateFilter").addEventListener("click", clearStateSelection);

   document.getElementById("allDestModal").addEventListener("click", function (e) {
                   if (e.target === this) closeModal();
   });

   document.getElementById("destSearch").addEventListener("input", function () {
                   renderModalTable(this.value);
   });

   document.querySelectorAll("#destTable th").forEach(function (th) {
                   th.addEventListener("click", function () {
                                     var col = this.dataset.sort;
                                     if (col === modalSortCol) {
                                                         modalSortAsc = !modalSortAsc;
                                     } else {
                                                         modalSortCol = col;
                                                         modalSortAsc = col !== "count";
                                     }
                                     renderModalTable(document.getElementById("destSearch").value);
                   });
   });

   /* Keyboard: close modal with Escape */
   document.addEventListener("keydown", function (e) {
                   if (e.key === "Escape") {
                                     var modal = document.getElementById("allDestModal");
                                     if (!modal.classList.contains("hidden")) closeModal();
                   }
   });

   var resizeTimer;
              window.addEventListener("resize", function () {
                              if (!svg || !mapReady) return;
                              clearTimeout(resizeTimer);
                              resizeTimer = setTimeout(function () {
                                                if (updateMapDimensions()) {
                                                                    g.selectAll(".state").attr("d", path);
                                                                    g.selectAll("path[fill='none']").attr("d", path);
                                                                    renderPins();
                                                }
                              }, 150);
              });

   loadCityCoords().then(initMap);
})();
