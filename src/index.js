require('dotenv').config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// Helper to fetch latest value from SEC data
const getLatestValue = (values) => {
  if (!values || !Array.isArray(values)) return "N/A";
  const sorted = values.sort((a, b) => new Date(b.end) - new Date(a.end));
  return sorted[0]?.val || "N/A";
};

// API endpoint to fetch all data with pagination and filtering
app.get("/api/data", async (req, res) => {
  const { secPage = 1, fdaPage = 1, limit = 10 } = req.query; // Pagination params
  const secStart = (secPage - 1) * limit;
  const fdaStart = (fdaPage - 1) * limit;

  try {
    // SEC EDGAR API (CVS Health, CIK 0000064803)
    let secData = { items: [], total: 0 };
    try {
      const secResponse = await axios.get(
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0000064803.json",
        { headers: { "User-Agent": "YourAppName/1.0 (your@email.com)" } }
      );
      console.log("SEC Response:", secResponse.data);
      const facts = secResponse.data.facts["us-gaap"];
      const secItems = Object.keys(facts).map(key => ({
        metric: key,
        value: getLatestValue(facts[key]?.units?.USD || facts[key]?.units?.shares),
        unit: facts[key]?.units?.USD ? "USD" : (facts[key]?.units?.shares ? "Shares" : "N/A"),
      }));
      secData = {
        items: secItems.slice(secStart, secStart + parseInt(limit)),
        total: secItems.length,
      };
    } catch (secError) {
      console.error("SEC Error:", secError.message);
    }

    // CMS Datasets (Multiple)
    let cmsData = {
      enrollment: { plan: "N/A", enrollment: "N/A" },
      spending: { drug: "N/A", cost: "N/A" },
    };
    try {
      const [enrollmentResponse, spendingResponse] = await Promise.all([
        axios.get("https://data.cms.gov/data-api/v1/dataset/0b15da5a-83d0-4f64-a93d-914e66fc7ecc/data?size=1"), // Monthly Enrollment
        axios.get("https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data"), // Part D Spending (Update ID)
      ]);
      console.log("CMS Enrollment Response:", enrollmentResponse.data);
      console.log("CMS Spending Response:", spendingResponse.data);
      cmsData.enrollment = {
        plan: enrollmentResponse.data[0]?.Plan_Name || "N/A",
        enrollment: enrollmentResponse.data[0]?.Enrollment || "N/A",
      };
      cmsData.spending = {
        drug: spendingResponse.data[0]?.Brnd_Name || "N/A",
        cost: spendingResponse.data[0]?.Tot_Spending || "N/A",
      };
    } catch (cmsError) {
      console.error("CMS Error:", cmsError.message);
    }

    // FDA (Multiple Datasets with Pagination)
    let fdaData = { drugs: [], recalls: [], events: [], totalDrugs: 0, totalRecalls: 0, totalEvents: 0 };
    try {
      const fdaPromises = [
        axios.get(`https://api.fda.gov/drug/drugsfda.json?limit=${limit}&skip=${fdaStart}`),
        axios.get(`https://api.fda.gov/drug/enforcement.json?limit=${limit}&skip=${fdaStart}`),
        axios.get(`https://api.fda.gov/drug/event.json?limit=${limit}&skip=${fdaStart}`),
      ];
      const [drugsResponse, recallsResponse, eventsResponse] = await Promise.all(
        fdaPromises.map(p => p.catch(e => ({ data: { meta: { results: { total: 0 } }, results: [] } })))
      );
      console.log("FDA Drugs Response:", drugsResponse.data);
      console.log("FDA Recalls Response:", recallsResponse.data);
      console.log("FDA Events Response:", eventsResponse.data);

      fdaData.drugs = drugsResponse.data.results.map(r => ({
        appNumber: r.application_number || "N/A",
        sponsor: r.sponsor_name || "N/A",
        drug: r.products?.[0]?.brand_name || "N/A",
        approvalDate: r.submissions?.[0]?.submission_date || "N/A",
      }));
      fdaData.recalls = recallsResponse.data.results.map(r => ({
        recallNumber: r.recall_number || "N/A",
        firm: r.recalling_firm || "N/A",
        reason: r.reason_for_recall || "N/A",
        date: r.recall_initiation_date || "N/A",
      }));
      fdaData.events = eventsResponse.data.results.map(r => ({
        reportNumber: r.safetyreportid || "N/A",
        company: r.companynumb || "N/A",
        date: r.receivedate || "N/A",
        reaction: r.patient?.reaction?.[0]?.reactionmeddrapt || "N/A",
      }));
      fdaData.totalDrugs = drugsResponse.data.meta.results.total;
      fdaData.totalRecalls = recallsResponse.data.meta.results.total;
      fdaData.totalEvents = eventsResponse.data.meta.results.total;
    } catch (fdaError) {
      console.error("FDA Error:", fdaError.message);
    }

    // NAIC (simulated)
    const naicData = JSON.parse(fs.readFileSync(path.join(__dirname, "../naic-sample.json"), "utf8"));

    // HealthData.gov (Fixing the error and adding multiple datasets)
    let healthData = {
      spending: [],
      total: 0,
    };
    try {
      const healthResponse = await axios.get(
        `https://healthdata.gov/api/3/action/datastore_search?resource_id=5fqrt-ahu2&limit=${limit}&offset=${secStart}` // Update ID
      );
      console.log("HealthData Response:", healthResponse.data);
      healthData.spending = healthResponse.data.result.records.map(r => ({
        drug: r.Brnd_Name || "N/A",
        totalSpending: r.Tot_Spndng_2022 || "N/A",
        units: r.Tot_Dsg_Unts_2022 || "N/A",
        claims: r.Tot_Clms_2022 || "N/A",
        avgSpendPerUnit: r.Avg_Spnd_Per_Dsg_Unt_Wghtd_2022 || "N/A",
      }));
      healthData.total = healthResponse.data.result.total;
    } catch (healthError) {
      console.error("HealthData Error:", healthError.message);
    }

    // NCBI (static)
    const ncbiData = { guidance: "Evaluate health info credibility per NCBI Bookshelf NBK25497." };

    res.json({
      sec: secData,
      cms: cmsData,
      fda: fdaData,
      naic: naicData,
      healthdata: healthData,
      ncbi: ncbiData,
    });
  } catch (error) {
    console.error("Global Error:", error.message);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});