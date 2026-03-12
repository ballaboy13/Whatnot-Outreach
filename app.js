(function () {
  var API_URL = "/api/parse-labels";
  var allData = { shipments: [], shows: [] };
  var currentFilter = "all";
  var projection, path, svg, g, mapWidth, mapHeight;
  var mapReady = false;
  var US_CITIES = {};

  var US_STATES = {
    AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
    CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
    HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
    KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
    MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
    NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
    NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
    OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
    SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
    VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
    DC:"District of Columbia"
  };

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
      loadExistingData();
    });
    svg.call(d3.zoom().scaleExtent([1, 8]).on("zoom", function (event) { g.attr("transform", event.transform); }));
  }

  async function loadExistingData() {
    try {
      var resp = await fetch(API_URL);
      if (resp.ok) {
        var text = await resp.text();
        if (text && text.trim().length > 0) { allData = JSON.parse(text); }
        if (!allData.shipments) allData.shipments = [];
        if (!allData.shows) allData.shows = [];
        updateShowFilter();
        renderPins();
        updateStats();
      }
    } catch (e) { console.log("No existing data yet", e); }
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
      if (data.count === 1) { pinG.append("circle").attr("r", 5).attr("class", "pin-dot"); }
      else {
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

  async function extractTextFromPDF(file) {
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var fullText = "";
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      var strings = content.items.map(function (item) { return item.str; });
      fullText += strings.join(" ") + "\n";
    }
    return fullText;
  }

  function parseAddressesFromText(text) {
    var locations = [];
    var pattern = /([A-Za-z][A-Za-z .'-]{1,30}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/g;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      var city = match[1].trim().replace(/\s+/g, " ");
      var state = match[2].trim();
      if (US_STATES[state] && city.length > 1) {
        locations.push({ city: city, state: state });
      }
    }
    return locations;
  }

  async function handleUpload(file) {
    showStatus("Parsing shipping labels...", "loading");
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      var text = await extractTextFromPDF(file);
      console.log("Extracted PDF text:", text.substring(0, 500));
      var locations = parseAddressesFromText(text);
      console.log("Parsed locations:", locations);
      if (locations.length === 0) {
        showStatus("No shipping addresses found in PDF. Make sure it contains labels with city, state, and ZIP.", "error");
        return;
      }
      var resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: locations }),
      });
      var respText = await resp.text();
      var result;
      try { result = JSON.parse(respText); } catch (e) {
        showStatus("Upload failed: Invalid server response.", "error");
        return;
      }
      if (!resp.ok) {
        showStatus("Error: " + (result.error || "Unknown error"), "error");
        return;
      }
      showStatus("Success! Found " + locations.length + " addresses. Total: " + result.totalShipments + " shipments.", "success");
      await loadExistingData();
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
