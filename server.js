
const express = require('express');
const cors = require('cors'); // Add this
const routes = require('./src/endpoints');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const axios = require('axios');
// const path = require('path');

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(express.static(path.join(__dirname, 'public')));

// // MongoDB Models
// const DrugSchema = new mongoose.Schema({ name: String, cost: Number, genericAvailable: Boolean, genericName: String, pbm: String, deaSchedule: String, approvals: { us: String, eu: String }, lastUpdated: Date });
// const Drug = mongoose.model('Drug', DrugSchema);

// const TrackedDrugSchema = new mongoose.Schema({ name: String, cost: Number, pbmOptions: [{ pbm: String, cost: Number }], trackedSince: Date });
// const TrackedDrug = mongoose.model('TrackedDrug', TrackedDrugSchema);

// const CompetitorSchema = new mongoose.Schema({ name: String, marketShare: Number, filing: String, pbmPartners: [String], patents: [{ number: String, title: String, expiry: String, linkedProduct: String }], pmas: [{ id: String, status: String }], lastUpdated: Date, isTracked: Boolean });
// const Competitor = mongoose.model('Competitor', CompetitorSchema);

// const RFPSchema = new mongoose.Schema({ title: String, issuer: String, budget: Number, winner: String, recommendation: String, lastUpdated: Date });
// const RFP = mongoose.model('RFP', RFPSchema);

// const TrendSchema = new mongoose.Schema({ category: String, description: String, source: String, date: String, lastUpdated: Date });
// const Trend = mongoose.model('Trend', TrendSchema);

// const AlertSchema = new mongoose.Schema({ type: String, message: String, date: Date });
// const Alert = mongoose.model('Alert', AlertSchema);

// // Real-Time Data Fetching (No API Key)
// async function fetchCMSData() {
//   try {
//     const response = await axios.get('https://data.cms.gov/data-api/v1/dataset/0d8f828e-5f61-4d5c-ab2e-879b6eecf323/data?limit=5', { timeout: 10000 });
//     return response.data.map(d => ({
//       name: d.Drug_Name,
//       cost: parseFloat(d.Total_Spending) || 0,
//       lastUpdated: new Date()
//     }));
//   } catch (err) {
//     console.error('CMS Fetch Error:', err.message);
//     return [
//       { name: "Humira (Fallback)", cost: 7045, lastUpdated: new Date() },
//       { name: "Lipitor (Fallback)", cost: 412, lastUpdated: new Date() }
//     ]; // Fallback data
//   }
// }

// async function fetchFDAOrangeBook() {
//   try {
//     const response = await axios.get('https://www.accessdata.fda.gov/scripts/cder/ob/results.cfm?Appl_Type=N&Appl_No=020702', { headers: { 'User-Agent': 'Mozilla/5.0' } });
//     const html = response.data;
//     const drugs = [];
//     const regex = /<tr>.*?<td>(.*?)<\/td>.*?<td>(.*?)<\/td>/g;
//     let match;
//     while ((match = regex.exec(html)) !== null) {
//       drugs.push({ name: match[1], genericAvailable: match[2].includes('Generic'), lastUpdated: new Date() });
//     }
//     return drugs.length ? drugs : [{ name: "OxyContin (Fallback)", genericAvailable: true, lastUpdated: new Date() }];
//   } catch (err) {
//     console.error('FDA Fetch Error:', err.message);
//     return [{ name: "OxyContin (Fallback)", genericAvailable: true, lastUpdated: new Date() }];
//   }
// }

// async function fetchUSPTOData() {
//   try {
//     const response = await axios.get('https://ppubs.uspto.gov/pubwebapp/static/pages/ppubsbasic.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
//     const html = response.data;
//     const patents = [];
//     const regex = /<a href=".*?patentNumber=(.*?)".*?>(.*?)<\/a>.*?(\d{4}-\d{2}-\d{2})/g;
//     let match;
//     while ((match = regex.exec(html)) !== null) {
//       patents.push({ number: match[1], title: match[2], expiry: match[3] });
//     }
//     return patents.length ? patents : [{ number: "US9876543", title: "Pharma Patent", expiry: "2030-01-01" }];
//   } catch (err) {
//     console.error('USPTO Fetch Error:', err.message);
//     return [{ number: "US9876543", title: "Pharma Patent", expiry: "2030-01-01" }];
//   }
// }

// async function fetchTrialsData() {
//   try {
//     const response = await axios.get('https://clinicaltrials.gov/api/v2/studies?query.term=pharma&limit=5');
//     return response.data.studies.map(t => ({
//       trialId: t.protocolSection.identificationModule.nctId,
//       description: t.protocolSection.descriptionModule?.briefSummary || "No summary",
//       lastUpdated: new Date()
//     }));
//   } catch (err) {
//     console.error('Trials Fetch Error:', err.message);
//     return [{ trialId: "NCT0456789", description: "Fallback trial", lastUpdated: new Date() }];
//   }
// }

// async function fetchPBMData() {
//   try {
//     const response = await axios.get('http://localhost:4000/scrape/pbm');
//     return response.data;
//   } catch (err) {
//     console.error('PBM Fetch Error:', err.message);
//     return [{ name: "Epclusa (Scraped Fallback)", cost: 24900 }];
//   }
// }

// // Seed Initial Data
// async function seedData() {
//   const cmsDrugs = await fetchCMSData();
//   const fdaDrugs = await fetchFDAOrangeBook();
//   const patents = await fetchUSPTOData();
//   const trials = await fetchTrialsData();
//   const pbmData = await fetchPBMData();

//   await Drug.deleteMany({});
//   await TrackedDrug.deleteMany({});
//   await Competitor.deleteMany({});
//   await RFP.deleteMany({});
//   await Trend.deleteMany({});
//   await Alert.deleteMany({});

//   const mockDrugs = [
//     ...cmsDrugs,
//     ...fdaDrugs.map(d => ({ ...d, cost: Math.floor(Math.random() * 10000), pbm: ["Express Scripts", "CVS Caremark", "OptumRx"][Math.floor(Math.random() * 3)], deaSchedule: "N/A", approvals: { us: "Approved", eu: Math.random() > 0.5 ? "Approved" : "Pending" } })),
//     ...pbmData.map(d => ({ ...d, genericAvailable: false, genericName: "N/A", deaSchedule: "N/A", approvals: { us: "Approved", eu: "Pending" }, lastUpdated: new Date() }))
//   ];
//   const mockCompetitors = [
//     { name: "UnitedHealth", marketShare: 25.3, filing: "Expanding PBM network", pbmPartners: ["OptumRx"], patents: patents.slice(0, 2).map(p => ({ ...p, linkedProduct: mockDrugs[0]?.name || "Unknown" })), pmas: [{ id: "PMA123", status: "Approved" }], lastUpdated: new Date(), isTracked: true },
//     { name: "Aetna", marketShare: 19.8, filing: "Reduce specialty drug costs", pbmPartners: ["CVS Caremark"], patents: [], pmas: [], lastUpdated: new Date(), isTracked: false },
//     { name: "Cigna", marketShare: 15.1, filing: "Adopt generics strategy", pbmPartners: ["Express Scripts"], patents: patents.slice(2, 4).map(p => ({ ...p, linkedProduct: mockDrugs[1]?.name || "Unknown" })), pmas: [{ id: "PMA456", status: "Pending" }], lastUpdated: new Date(), isTracked: true },
//   ];
//   const mockRFPs = [
//     { title: "2025 PBM Contract", issuer: "Blue Cross", budget: 75000000, winner: "CVS Caremark", recommendation: "OptumRx: 12% lower rates", lastUpdated: new Date() },
//     { title: "Medicare Drug Plan", issuer: "CMS", budget: 30000000, winner: "Express Scripts", recommendation: "Switch to generics saves $5M", lastUpdated: new Date() },
//   ];
//   const mockTrends = trials.map(t => ({ category: "Clinical Trials", description: t.description, source: "ClinicalTrials.gov", date: new Date().toLocaleDateString(), lastUpdated: new Date() }));

//   await Drug.insertMany(mockDrugs);
//   await Competitor.insertMany(mockCompetitors);
//   await RFP.insertMany(mockRFPs);
//   await Trend.insertMany(mockTrends);
//   await Alert.insertMany([{ type: "System", message: "Loaded real-time CMS, FDA, USPTO, and scraped data", date: new Date() }]);
//   console.log('Real-time data seeded');
// }

// // API Routes
// app.get('/api/drugs/high-cost', async (req, res) => res.json(await Drug.find({ cost: { $gt: 1000 } }).sort({ lastUpdated: -1 })));
// app.get('/api/drugs/search', async (req, res) => {
//   const { query } = req.query;
//   const drugs = await Drug.find({ name: { $regex: query, $options: 'i' } });
//   const alternatives = drugs.map(d => ({
//     ...d._doc,
//     pbmOptions: [
//       { pbm: "Express Scripts", cost: d.cost * 0.95 },
//       { pbm: "CVS Caremark", cost: d.cost * 1.05 },
//       { pbm: "OptumRx", cost: d.cost * 0.9 },
//     ],
//   }));
//   res.json(alternatives);
// });
// app.post('/api/drugs/track', async (req, res) => {
//   const { name } = req.body;
//   const drug = await Drug.findOne({ name });
//   if (!drug) return res.status(404).json({ error: "Drug not found" });
//   const trackedDrug = { name: drug.name, cost: drug.cost, pbmOptions: [{ pbm: "Express Scripts", cost: drug.cost * 0.95 }, { pbm: "CVS Caremark", cost: drug.cost * 1.05 }, { pbm: "OptumRx", cost: drug.cost * 0.9 }], trackedSince: new Date() };
//   await TrackedDrug.updateOne({ name }, trackedDrug, { upsert: true });
//   await Alert.create({ type: "Drug Tracking", message: `Started tracking ${name}`, date: new Date() });
//   res.json(trackedDrug);
// });
// app.get('/api/drugs/tracked', async (req, res) => res.json(await TrackedDrug.find().sort({ trackedSince: -1 })));
// app.get('/api/competitors', async (req, res) => res.json(await Competitor.find().sort({ lastUpdated: -1 })));
// app.post('/api/competitors/track', async (req, res) => {
//   const { name } = req.body;
//   const competitor = await Competitor.findOneAndUpdate({ name }, { isTracked: true, lastUpdated: new Date() }, { new: true });
//   if (!competitor) return res.status(404).json({ error: "Competitor not found" });
//   await Alert.create({ type: "Competitor Tracking", message: `Started tracking ${name}`, date: new Date() });
//   res.json(competitor);
// });
// app.get('/api/rfps', async (req, res) => res.json(await RFP.find().sort({ lastUpdated: -1 })));
// app.get('/api/trends', async (req, res) => res.json(await Trend.find().sort({ lastUpdated: -1 })));
// app.get('/api/alerts', async (req, res) => res.json(await Alert.find().sort({ date: -1 }).limit(5)));

// // Real-Time Updates
// setInterval(async () => {
//   const drugs = await fetchCMSData();
//   for (const drug of drugs.slice(0, 1)) {
//     drug.cost += Math.floor(Math.random() * 1000 - 500);
//     drug.lastUpdated = new Date();
//     await Drug.updateOne({ name: drug.name }, drug, { upsert: true });
//     await Alert.create({ type: "Drug Cost", message: `${drug.name} cost updated to $${drug.cost}`, date: new Date() });
//   }
// }, 60000);

// // Connect to MongoDB Atlas
// const MONGO_URI = 'mongodb+srv://syneticslz:gMN1GUBtevSaw8DE@synetictest.bl3xxux.mongodb.net/healthcare-insights?retryWrites=true&w=majority&appName=SyneticTest';
// mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(async () => {
//     console.log('Connected to MongoDB Atlas');
//     await seedData();
//     app.listen(3000, () => console.log('Server running on port 3000'));
//   })
//   .catch(err => console.error('MongoDB Connection Error:', err));