(function () {
      var API_URL = "/api/parse-labels";
      var STORAGE_KEY = "whatnot-outreach-data";
      var allData = { shipments: [], shows: [] };
      var currentFilter = "all";
      var projection, path, svg, g, mapWidth, mapHeight;
      var mapReady = false;
      var US_CITIES = {};

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
                                 var parts = [];
                                 var current = "";
                                 var inQuotes = false;
                                 for (var j = 0; j < line.length; j++) {
                                               if (line[j] === '"') { inQuotes = !inQuotes; }
                                               else if (line[j] === ',' && !inQuotes) { parts.push(current); current = ""; }
                                               else { current += line[j]; }
                                 }
                                 parts.push(current);
                                 if (parts.length >= 7) {
                                               var stateCode = parts[1];
                                               var city = parts[3];
                                               var lat = parseFloat(parts[5]);
                                               var lng = parseFloat(parts[6]);
                                               if (city && stateCode && !isNaN(lat) && !isNaN(lng)) {
                                                               US_CITIES[(city + ", " + stateCode).toUpperCase()] = { lat: lat, lng: lng };
                                               }
                                 }
                     }
           } catch (e) { console.log("Failed to load city coordinates", e); }
   }

   function showStatus(msg, type) {
           var el = document.getElementById("status");
           el.textContent = msg;
           el.className = "status " + type;
   }

   function hideStatus() {
           document.getElementById("status").className = "status hidden";
   }

   function initMap() {
           var container = document.getElementById("map-container");
           mapWidth = container.clientWidth;
           mapHeight = container.clientHeight || window.innerHeight - 70;
           svg = d3.select("#map").attr("width", mapWidth).attr("height", mapHeight);
           projection = d3.geoAlbersUsa().translate([mapWidth / 2, mapHeight / 2]).scale(mapWidth * 1.1);
           path = d3.geoPath().projection(projection);
           g = svg.append("g");

        d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(function (us) {
                  g.selectAll("path").data(topojson.feature(us, us.objects.states).features)
                    .enter().append("path").attr("d", path).attr("class", "state");
                  g.append("path").datum(topojson.mesh(us, us.objects.states, function (a, b) { return a !== b; }))
                    .attr("fill", "none").attr("stroke", "#ccc").attr("stroke-width", "0.5px").attr("d", path);
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
                     var s = shipments[i];
                     var key = (s.city + ", " + s.state).toUpperCase();
                     if (!cityMap[key]) cityMap[key] = { city: s.city, state: s.state, count: 0, shows: [] };
                     cityMap[key].count++;
                     if (cityMap[key].shows.indexOf(s.show) === -1) cityMap[key].shows.push(s.show);
           }
           var tooltip = document.getElementById("tooltip");
           var entries = Object.entries(cityMap);
           for (var j = 0; j < entries.length; j++) {
                     var k = entries[j][0], data = entries[j][1];
                     var coords = US_CITIES[k];
                     if (!coords) continue;
                     var projected = projection([coords.lng, coords.lat]);
                     if (!projected) continue;
                     var pinG = g.append("g").attr("class", "pin").attr("transform", "translate(" + projected[0] + "," + projected[1] + ")");
                     if (data.count === 1) {
                                 pinG.append("circle").attr("r", 5).attr("class", "pin-dot");
                     } else {
                                 var r = Math.min(6 + Math.log2(data.count) * 4, 22);
                                 pinG.append("circle").attr("r", r).attr("class", "pin-cluster");
                                 pinG.append("text").attr("class", "pin-label").text(data.count);
                     }
                     (function(d) {
                                 pinG.on("mouseover", function (event) {
                                               tooltip.innerHTML = "<h4>" + d.city + ", " + d.state + "</h4><p>" + d.count + " shipment" + (d.count > 1 ? "s" : "") + "</p><p>Shows: " + d.shows.join(", ") + "</p>";
                                               tooltip.className = "tooltip";
                                               tooltip.style.left = event.offsetX + 12 + "px";
                                               tooltip.style.top = event.offsetY - 10 + "px";
                                 });
                                 pinG.on("mouseout", function () { tooltip.className = "tooltip hidden"; });
                     })(data);
           }
   }

   function updateStats() {
           var shipments = getFilteredShipments();
           var cities = {}, states = {}, cityCount = {};
           for (var i = 0; i < shipments.length; i++) {
                     var s = shipments[i];
                     var ck = s.city + ", " + s.state;
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

   function fileToBase64(file) {
           return new Promise(function (resolve, reject) {
                     var reader = new FileReader();
                     reader.onload = function () { resolve(reader.result.split(",")[1]); };
                     reader.onerror = reject;
                     reader.readAsDataURL(file);
           });
   }

   async function handleUpload(file) {
           showStatus("Uploading and parsing shipping labels with AI...", "loading");
           try {
                     var pdfBase64 = await fileToBase64(file);
                     var resp = await fetch(API_URL, {
                                 method: "POST",
                                 headers: { "Content-Type": "application/json" },
                                 body: JSON.stringify({ pdfBase64: pdfBase64 }),
                     });
                     var result = await resp.json();
                     if (!resp.ok) {
                                 showStatus("Error: " + (result.error || "Unknown error"), "error");
                                 return;
                     }
                     var locations = result.locations || [];
                     if (locations.length === 0) {
                                 showStatus("No addresses found in the PDF.", "error");
                                 return;
                     }
                     var now = new Date();
                     var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                     var showName = months[now.getMonth()] + " " + now.getDate() + " " + now.getFullYear();
                     var timestamp = now.toISOString();
                     if (!allData.shows.includes(showName)) { allData.shows.push(showName); }
                     for (var i = 0; i < locations.length; i++) {
                                 allData.shipments.push({ city: locations[i].city, state: locations[i].state, show: showName, timestamp: timestamp });
                     }
                     saveData();
                     updateShowFilter();
                     renderPins();
                     updateStats();
                     showStatus("Success! Found " + locations.length + " addresses. Total: " + allData.shipments.length + " shipments.", "success");
                     setTimeout(hideStatus, 5000);
           } catch (err) {
                     console.error("Upload error:", err);
                     showStatus("Upload failed: " + err.message, "error");
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
           var container = document.getElementById("map-container");
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
